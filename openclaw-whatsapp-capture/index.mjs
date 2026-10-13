import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, realpath, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import pg from "pg";
import { Client as MinioClient } from "minio";

const { Pool } = pg;
const OPENCLAW_HOME = path.join(os.homedir(), ".openclaw");

let pool;
let minio;
const inFlightObjects = new Map();

function getPool() {
  if (pool) return pool;
  const connectionString = process.env.WA_CAPTURE_DATABASE_URL;
  if (!connectionString) throw new Error("WA_CAPTURE_DATABASE_URL is not configured");
  pool = new Pool({
    connectionString,
    max: 4,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 15000,
    application_name: "openclaw-whatsapp-capture",
  });
  pool.on("error", (error) => {
    console.error("[whatsapp-capture] PostgreSQL pool error", error?.code ?? "unknown");
  });
  return pool;
}

function getMinio() {
  if (minio) return minio;
  const endpoint = process.env.WA_CAPTURE_MINIO_ENDPOINT ?? "127.0.0.1:9010";
  const url = new URL(endpoint.includes("://") ? endpoint : `http://${endpoint}`);
  const accessKey = process.env.WA_CAPTURE_MINIO_ACCESS_KEY;
  const secretKey = process.env.WA_CAPTURE_MINIO_SECRET_KEY;
  if (!accessKey || !secretKey) throw new Error("MinIO capture credentials are not configured");
  minio = new MinioClient({
    endPoint: url.hostname,
    port: Number(url.port || (url.protocol === "https:" ? 443 : 80)),
    useSSL: url.protocol === "https:",
    accessKey,
    secretKey,
    pathStyle: true,
  });
  return minio;
}

function toText(value) {
  return typeof value === "string" ? value : value == null ? null : String(value);
}

function timestampToDate(value) {
  if (value == null) return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    const milliseconds = value < 1_000_000_000_000 ? value * 1000 : value;
    const date = new Date(milliseconds);
    return Number.isNaN(date.valueOf()) ? null : date;
  }
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? null : date;
}

function mediaKind(fact) {
  const contentType = String(fact?.contentType ?? "").toLowerCase();
  const kind = String(fact?.kind ?? "").toLowerCase();
  if (contentType.startsWith("image/") || kind.includes("image")) return "image";
  if (contentType.startsWith("video/") || kind.includes("video")) return "video";
  if (contentType.startsWith("audio/") || kind.includes("audio") || kind.includes("voice")) return "audio";
  if (kind.includes("sticker")) return "sticker";
  if (contentType && contentType !== "application/octet-stream") return "document";
  return "other";
}

function cleanFileName(value) {
  if (!value) return null;
  const name = path.basename(String(value)).replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 255);
  return name || null;
}

function eventChatId(event, ctx, direction) {
  const candidate = direction === "inbound"
    ? ctx.conversationId ?? event.threadId ?? event.from
    : event.to ?? ctx.conversationId;
  return normalizedTarget(candidate) || "unknown";
}

function isGroupChat(chatId) {
  return chatId.endsWith("@g.us");
}

function allowedByConfig(event, ctx, direction, allowedChats) {
  const normalizedAllowedChats = new Set([...allowedChats].map(normalizedTarget));
  if (normalizedAllowedChats.size === 0) return false;
  const candidates = direction === "inbound"
    ? [event.threadId, event.from, ctx.conversationId]
    : [event.to, ctx.conversationId];
  return candidates.some((value) => value != null && normalizedAllowedChats.has(normalizedTarget(value)));
}

function configuredGroupChats(config) {
  return new Set(Array.isArray(config.allowedChats)
    ? config.allowedChats
      .map(normalizedTarget)
      .filter((value) => value.endsWith("@g.us"))
    : []);
}

function normalizedTarget(value) {
  if (value == null) return "";
  return String(value).trim().replace(/^whatsapp:/i, "").toLowerCase();
}

function targetsConfiguredGroup(values, config) {
  const groupChats = configuredGroupChats(config);
  return values.some((value) => {
    const target = normalizedTarget(value);
    return target.endsWith("@g.us") && groupChats.has(target);
  });
}

function configuredInboundGroupId(event, ctx, config) {
  const groupChats = configuredGroupChats(config);
  const candidates = [ctx.conversationId, event.threadId, event.sessionKey, ctx.sessionKey];
  for (const value of candidates) {
    const candidate = normalizedTarget(value);
    for (const groupChatId of groupChats) {
      if (candidate === groupChatId || candidate.endsWith(`:${groupChatId}`)) return groupChatId;
    }
  }
  return null;
}

function isReadOnlyGroupOutbound(event, ctx, config) {
  const channelId = String(ctx.channelId ?? event.channel ?? event.metadata?.channel ?? "").toLowerCase();
  if (channelId !== "whatsapp") return false;
  return targetsConfiguredGroup([ctx.conversationId, event.to], config);
}

function isReadOnlyGroupMessageTool(event, config) {
  if (String(event.toolName ?? "").toLowerCase() !== "message") return false;
  const params = event.params ?? {};
  return targetsConfiguredGroup([
    params.to,
    params.target,
    params.chatId,
    params.conversationId,
    params.groupId,
  ], config);
}

function logBlockedReply(logger) {
  logger.warn("[whatsapp-capture] blocked an outbound message to the configured read-only WhatsApp group");
}

function providerMessageId(event, ctx, direction, chatId, senderId, body, timestamp) {
  const explicitId = event.messageId ?? ctx.messageId ?? event.providerUpdate?.messageId ?? event.providerUpdate?.id;
  if (explicitId != null && String(explicitId)) return String(explicitId);
  const fingerprint = [direction, chatId, senderId ?? "", timestamp?.toISOString() ?? "", body ?? ""].join("\u001f");
  return `synthetic:${createHash("sha256").update(fingerprint).digest("hex")}`;
}

function safeLocation(location) {
  if (!location || typeof location !== "object") return null;
  const result = {};
  for (const key of ["latitude", "longitude", "accuracy", "name", "address", "source", "isLive", "livePeriodSeconds", "caption"]) {
    const value = location[key];
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") result[key] = value;
  }
  return Object.keys(result).length ? result : null;
}

async function saveMessage(event, ctx, direction, logger, config) {
  const channelId = String(ctx.channelId ?? "").toLowerCase();
  if (channelId !== "whatsapp") return;

  const allowedChats = new Set(Array.isArray(config.allowedChats)
    ? config.allowedChats.map((value) => String(value).trim()).filter(Boolean)
    : []);
  const directionEnabled = direction === "inbound" ? config.captureInbound === true : config.captureOutbound === true;
  if (!directionEnabled || !allowedByConfig(event, ctx, direction, allowedChats)) return;

  const chatId = eventChatId(event, ctx, direction);
  const accountId = toText(ctx.accountId) || "default";
  const body = toText(direction === "inbound" ? event.content : event.content);
  const senderId = direction === "inbound"
    ? toText(event.senderId ?? event.from)
    : null;
  const recipientId = direction === "outbound" ? toText(event.to) : null;
  const sentAt = direction === "inbound" ? timestampToDate(event.timestamp) : new Date();
  const externalId = providerMessageId(event, ctx, direction, chatId, senderId, body, sentAt);
  const mediaFacts = direction === "inbound" && Array.isArray(event.media) ? event.media : [];
  const deferredMediaFacts = direction === "inbound" && event.mediaStagingPending === true && Array.isArray(event.originalMedia)
    ? event.originalMedia
    : [];
  const allMediaFacts = mediaFacts.length ? mediaFacts : deferredMediaFacts;
  const inferredKind = allMediaFacts.length ? mediaKind(allMediaFacts[0]) : event.location ? "location" : "text";
  const senderDisplayName = toText(
    event.senderName
      ?? event.senderUsername
      ?? event.metadata?.senderName
      ?? event.metadata?.senderUsername,
  );
  const chatDisplayName = toText(
    event.chatName
      ?? event.groupName
      ?? event.metadata?.groupName
      ?? event.metadata?.conversationName
      ?? event.metadata?.channelName
      ?? event.metadata?.topicName,
  );
  const providerMetadata = {
    ...(event.mediaStagingPending === true ? { mediaStagingPending: true } : {}),
    ...(safeLocation(event.location) ? { location: safeLocation(event.location) } : {}),
  };

  const client = getPool();
  const result = await client.query(
    `INSERT INTO whatsapp_capture.conversations
       (account_id, remote_chat_id, display_name, is_group, last_message_at)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (account_id, remote_chat_id) DO UPDATE SET
       display_name = COALESCE(EXCLUDED.display_name, whatsapp_capture.conversations.display_name),
       is_group = EXCLUDED.is_group,
       last_message_at = GREATEST(whatsapp_capture.conversations.last_message_at, EXCLUDED.last_message_at),
       updated_at = now()
     RETURNING id`,
    [accountId, chatId, chatDisplayName, isGroupChat(chatId), sentAt],
  );
  const conversationId = result.rows[0].id;

  const messageResult = await client.query(
    `INSERT INTO whatsapp_capture.messages
       (conversation_id, external_message_id, direction, sender_id, sender_display_name,
        recipient_id, body_text, message_kind, sent_at, reply_to_external_id,
        provider_event_id, delivery_status, provider_metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb)
     ON CONFLICT (conversation_id, external_message_id, direction) DO NOTHING
     RETURNING id`,
    [
      conversationId,
      externalId,
      direction,
      senderId,
      senderDisplayName,
      recipientId,
      body,
      inferredKind,
      sentAt,
      toText(event.replyToId),
      toText(event.providerUpdate?.id),
      direction === "outbound" ? (event.success === true ? "sent" : "failed") : null,
      JSON.stringify(providerMetadata),
    ],
  );
  const messageId = messageResult.rows[0]?.id ?? (await client.query(
    `SELECT id FROM whatsapp_capture.messages
      WHERE conversation_id = $1 AND external_message_id = $2 AND direction = $3`,
    [conversationId, externalId, direction],
  )).rows[0]?.id;
  if (!messageId) throw new Error("Message row was not available after upsert");

  for (let ordinal = 0; ordinal < allMediaFacts.length; ordinal += 1) {
    await saveMediaFact(messageId, ordinal, allMediaFacts[ordinal], {
      allowRead: mediaFacts.length > 0,
      client,
      logger,
    });
  }
}

function candidateRoots(workspaceDir) {
  return [OPENCLAW_HOME, workspaceDir]
    .filter((value) => typeof value === "string" && path.isAbsolute(value));
}

function isWithin(root, target) {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

async function resolveLocalMediaPath(fact) {
  if (!fact || typeof fact.path !== "string" || !fact.path.trim()) return null;
  const workspaceDir = typeof fact.workspaceDir === "string" ? fact.workspaceDir : null;
  const provisional = path.isAbsolute(fact.path)
    ? path.resolve(fact.path)
    : path.resolve(workspaceDir ?? OPENCLAW_HOME, fact.path);
  const fileInfo = await lstat(provisional);
  if (fileInfo.isSymbolicLink() || !fileInfo.isFile()) return null;
  const resolved = await realpath(provisional);
  const allowed = candidateRoots(workspaceDir).some((root) => {
    try {
      return isWithin(path.resolve(root), resolved);
    } catch {
      return false;
    }
  });
  if (!allowed) return null;
  return { path: resolved, stat: await stat(resolved) };
}

async function sha256File(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

function missingObject(error) {
  return error?.statusCode === 404 || ["NotFound", "NoSuchKey", "NoSuchObject"].includes(error?.code);
}

async function objectExists(client, bucket, key) {
  try {
    await client.statObject(bucket, key);
    return true;
  } catch (error) {
    if (missingObject(error)) return false;
    throw error;
  }
}

async function uploadOnce(bucket, key, filePath, sizeBytes, contentType, sha256) {
  const existing = inFlightObjects.get(key);
  if (existing) return existing;
  const task = (async () => {
    const client = getMinio();
    if (!(await objectExists(client, bucket, key))) {
      await client.putObject(bucket, key, createReadStream(filePath), sizeBytes, {
        "Content-Type": contentType,
        "x-amz-meta-sha256": sha256,
      });
    }
  })();
  inFlightObjects.set(key, task);
  try {
    await task;
  } finally {
    inFlightObjects.delete(key);
  }
}

async function saveMediaFact(messageId, ordinal, fact, { allowRead, client, logger }) {
  const contentType = toText(fact?.contentType) || null;
  const kind = mediaKind(fact);
  const fileName = cleanFileName(fact?.fileName ?? fact?.path);
  const facts = {
    messageId,
    ordinal,
    fileName,
    kind,
    contentType,
  };

  if (!allowRead || !fact?.path) {
    const pending = fact?.path || fact?.url ? "pending" : "unavailable";
    await client.query(
      `INSERT INTO whatsapp_capture.message_media
         (message_id, ordinal, file_name, media_kind, content_type, state)
       VALUES ($1, $2, $3, $4::whatsapp_capture.media_kind, $5, $6::whatsapp_capture.media_state)
       ON CONFLICT (message_id, ordinal) DO UPDATE SET
         file_name = COALESCE(EXCLUDED.file_name, whatsapp_capture.message_media.file_name),
         media_kind = EXCLUDED.media_kind,
         content_type = COALESCE(EXCLUDED.content_type, whatsapp_capture.message_media.content_type),
         state = CASE WHEN whatsapp_capture.message_media.state = 'stored' THEN 'stored'::whatsapp_capture.media_state ELSE EXCLUDED.state END,
         updated_at = now()`,
      [messageId, ordinal, fileName, kind, contentType, pending],
    );
    return;
  }

  let localFile;
  try {
    localFile = await resolveLocalMediaPath(fact);
  } catch (error) {
    logger.warn(`[whatsapp-capture] media path unavailable at ordinal ${ordinal}: ${error?.code ?? "read_error"}`);
  }
  if (!localFile) {
    await client.query(
      `INSERT INTO whatsapp_capture.message_media
         (message_id, ordinal, file_name, media_kind, content_type, state, last_error)
       VALUES ($1, $2, $3, $4::whatsapp_capture.media_kind, $5, 'failed', 'media_path_unavailable')
       ON CONFLICT (message_id, ordinal) DO UPDATE SET
         file_name = COALESCE(EXCLUDED.file_name, whatsapp_capture.message_media.file_name),
         media_kind = EXCLUDED.media_kind,
         content_type = COALESCE(EXCLUDED.content_type, whatsapp_capture.message_media.content_type),
         state = CASE WHEN whatsapp_capture.message_media.state = 'stored' THEN 'stored'::whatsapp_capture.media_state ELSE 'failed'::whatsapp_capture.media_state END,
         last_error = CASE WHEN whatsapp_capture.message_media.state = 'stored' THEN whatsapp_capture.message_media.last_error ELSE EXCLUDED.last_error END,
         updated_at = now()`,
      [messageId, ordinal, fileName, kind, contentType],
    );
    return;
  }

  try {
    const sha256 = await sha256File(localFile.path);
    const freshStat = await stat(localFile.path);
    if (freshStat.size !== localFile.stat.size || freshStat.mtimeMs !== localFile.stat.mtimeMs) {
      throw new Error("media_changed_during_read");
    }
    const bucket = process.env.WA_CAPTURE_MINIO_BUCKET ?? "whatsapp-media";
    const objectKey = `sha256/${sha256.slice(0, 2)}/${sha256}`;
    const effectiveContentType = contentType || "application/octet-stream";

    await client.query(
      `INSERT INTO whatsapp_capture.media_objects
         (sha256, bucket, object_key, content_type, size_bytes, state)
       VALUES ($1, $2, $3, $4, $5, 'pending')
       ON CONFLICT (sha256) DO UPDATE SET
         state = CASE WHEN whatsapp_capture.media_objects.state = 'stored' THEN 'stored'::whatsapp_capture.media_state ELSE 'pending'::whatsapp_capture.media_state END,
         last_error = NULL`,
      [sha256, bucket, objectKey, effectiveContentType, freshStat.size],
    );
    await uploadOnce(bucket, objectKey, localFile.path, freshStat.size, effectiveContentType, sha256);
    await client.query(
      `UPDATE whatsapp_capture.media_objects
          SET state = 'stored', stored_at = COALESCE(stored_at, now()), last_error = NULL
        WHERE sha256 = $1`,
      [sha256],
    );
    await client.query(
      `INSERT INTO whatsapp_capture.message_media
         (message_id, ordinal, file_name, media_kind, content_type, size_bytes, sha256, state)
       VALUES ($1, $2, $3, $4::whatsapp_capture.media_kind, $5, $6, $7, 'stored')
       ON CONFLICT (message_id, ordinal) DO UPDATE SET
         file_name = COALESCE(EXCLUDED.file_name, whatsapp_capture.message_media.file_name),
         media_kind = EXCLUDED.media_kind,
         content_type = COALESCE(EXCLUDED.content_type, whatsapp_capture.message_media.content_type),
         size_bytes = EXCLUDED.size_bytes,
         sha256 = EXCLUDED.sha256,
         state = 'stored',
         last_error = NULL,
         updated_at = now()`,
      [messageId, ordinal, fileName, kind, effectiveContentType, freshStat.size, sha256],
    );
  } catch (error) {
    const code = String(error?.code ?? error?.name ?? "storage_error").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);
    await client.query(
      `INSERT INTO whatsapp_capture.message_media
         (message_id, ordinal, file_name, media_kind, content_type, size_bytes, state, last_error)
       VALUES ($1, $2, $3, $4::whatsapp_capture.media_kind, $5, $6, 'failed', $7)
       ON CONFLICT (message_id, ordinal) DO UPDATE SET
         file_name = COALESCE(EXCLUDED.file_name, whatsapp_capture.message_media.file_name),
         media_kind = EXCLUDED.media_kind,
         content_type = COALESCE(EXCLUDED.content_type, whatsapp_capture.message_media.content_type),
         size_bytes = COALESCE(EXCLUDED.size_bytes, whatsapp_capture.message_media.size_bytes),
         state = CASE WHEN whatsapp_capture.message_media.state = 'stored' THEN 'stored'::whatsapp_capture.media_state ELSE 'failed'::whatsapp_capture.media_state END,
         last_error = CASE WHEN whatsapp_capture.message_media.state = 'stored' THEN whatsapp_capture.message_media.last_error ELSE EXCLUDED.last_error END,
         updated_at = now()`,
      [messageId, ordinal, fileName, kind, contentType, localFile.stat.size, code],
    );
    logger.error(`[whatsapp-capture] media ingest failed at ordinal ${ordinal}: ${code}`);
  }
}

function hookError(logger, label, error) {
  logger.error(`[whatsapp-capture] ${label} failed: ${error?.code ?? error?.name ?? "unknown_error"}`);
}

export default {
  id: "whatsapp-capture",
  name: "WhatsApp Capture",
  description: "Stores allowlisted WhatsApp messages in PostgreSQL and content-addressed media in MinIO.",
  register(api) {
    const config = api.pluginConfig ?? {};

    // Enforce read-only behavior at OpenClaw's outbound delivery boundary.
    // Keep these checks scoped to the exact group JIDs already allowlisted for capture.
    api.on("reply_payload_sending", (event, ctx) => {
      if (!isReadOnlyGroupOutbound(event, ctx, config)) return;
      logBlockedReply(api.logger);
      return { cancel: true, reason: "configured WhatsApp group is read-only" };
    });

    api.on("message_sending", (event, ctx) => {
      if (!isReadOnlyGroupOutbound(event, ctx, config)) return;
      logBlockedReply(api.logger);
      return { cancel: true, cancelReason: "configured WhatsApp group is read-only" };
    });

    // Also block explicit calls to OpenClaw's message tool addressed to this group.
    api.on("before_tool_call", (event) => {
      if (!isReadOnlyGroupMessageTool(event, config)) return;
      logBlockedReply(api.logger);
      return { block: true, blockReason: "The configured WhatsApp group is read-only." };
    });

    // Capture allowlisted group text before ordinary model dispatch, then
    // claim the message silently. This lets the gateway ingest every group
    // message without requiring a mention or generating a reply/model call.
    api.on("before_dispatch", async (event, ctx) => {
      const channelId = String(event.channel ?? ctx.channelId ?? "").toLowerCase();
      if (channelId !== "whatsapp" || config.captureInbound !== true) return;

      const chatId = configuredInboundGroupId(event, ctx, config);
      if (!chatId) return;

      try {
        await saveMessage({
          ...event,
          from: event.senderId ?? ctx.senderId,
          senderId: event.senderId ?? ctx.senderId,
          messageId: event.messageId ?? ctx.messageId,
        }, {
          ...ctx,
          channelId,
          conversationId: chatId,
          messageId: ctx.messageId ?? event.messageId,
        }, "inbound", api.logger, config);
      } catch (error) {
        hookError(api.logger, "inbound message capture before dispatch", error);
      }
      return { handled: true };
    });

    api.on("message_received", async (event, ctx) => {
      try {
        await saveMessage(event, ctx, "inbound", api.logger, config);
      } catch (error) {
        hookError(api.logger, "inbound message capture", error);
      }
    });

    api.on("message_sent", async (event, ctx) => {
      try {
        await saveMessage(event, ctx, "outbound", api.logger, config);
      } catch (error) {
        hookError(api.logger, "outbound message capture", error);
      }
    });
  },
};
