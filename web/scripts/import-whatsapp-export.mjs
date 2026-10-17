#!/usr/bin/env node

/**
 * Importa respaldos ZIP de WhatsApp sin descomprimir rutas del archivo.
 * Por defecto solo analiza; --apply inserta mensajes y multimedia en PostgreSQL/MinIO.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createReadStream } from "node:fs";
import { basename, resolve } from "node:path";
import { Client as MinioClient } from "minio";
import pg from "pg";

const { Pool } = pg;
const DEFAULT_TIMEZONE = "America/Mexico_City";
const MAX_TEXT_BYTES = 32 * 1024 * 1024;
const MAX_MEDIA_BYTES = 512 * 1024 * 1024;
const MEDIA_EXTENSIONS = new Set([
  "jpg", "jpeg", "png", "gif", "webp", "heic", "heif", "bmp",
  "mp4", "mov", "m4v", "3gp", "avi", "webm",
  "opus", "ogg", "mp3", "m4a", "aac", "wav",
  "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "zip", "vcf",
]);
const EXT_KIND = new Map([
  ["jpg", "image"], ["jpeg", "image"], ["png", "image"], ["gif", "image"], ["webp", "image"],
  ["heic", "image"], ["heif", "image"], ["bmp", "image"],
  ["mp4", "video"], ["mov", "video"], ["m4v", "video"], ["3gp", "video"], ["avi", "video"], ["webm", "video"],
  ["opus", "audio"], ["ogg", "audio"], ["mp3", "audio"], ["m4a", "audio"], ["aac", "audio"], ["wav", "audio"],
  ["pdf", "document"], ["doc", "document"], ["docx", "document"], ["xls", "document"], ["xlsx", "document"],
  ["ppt", "document"], ["pptx", "document"], ["txt", "document"], ["zip", "document"], ["vcf", "document"],
]);
const MARKERS = new Map([
  ["<image omitted>", { kind: "image", label: "foto omitida por la exportación" }],
  ["<album message>", { kind: "image", label: "álbum; la exportación no indica cuántas fotos contiene" }],
  ["<video omitted>", { kind: "video", label: "video omitido por la exportación" }],
  ["<audio omitted>", { kind: "audio", label: "audio omitido por la exportación" }],
  ["<voice message omitted>", { kind: "audio", label: "nota de voz omitida por la exportación" }],
  ["<sticker omitted>", { kind: "sticker", label: "sticker omitido por la exportación" }],
  ["<gif omitted>", { kind: "other", label: "GIF omitido por la exportación" }],
  ["<document omitted>", { kind: "document", label: "documento omitido por la exportación" }],
  ["<unknown message>", { kind: "other", label: "mensaje multimedia de tipo desconocido" }],
]);

function usage() {
  console.log(`Uso:\n  node db/scripts/import-whatsapp-export.mjs archivo.zip --conversation-id UUID [opciones]\n\nOpciones:\n  --apply                 Escribe en PostgreSQL y guarda archivos en MinIO.\n  --date-format mdy|dmy   Formato de fecha si el respaldo no permite inferirlo.\n  --timezone ZONA         Zona del texto exportado (predeterminado: ${DEFAULT_TIMEZONE}).\n  --help                  Muestra esta ayuda.\n\nSin --apply se ejecuta en modo de análisis, sin modificar datos.`);
}

function parseArgs(argv) {
  const args = { apply: false, dateFormat: null, timezone: DEFAULT_TIMEZONE, archive: null, conversationId: null };
  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    if (value === "--help" || value === "-h") {
      usage();
      process.exit(0);
    } else if (value === "--apply") args.apply = true;
    else if (value === "--conversation-id") args.conversationId = argv[++i] ?? null;
    else if (value === "--date-format") args.dateFormat = argv[++i] ?? null;
    else if (value === "--timezone") args.timezone = argv[++i] ?? DEFAULT_TIMEZONE;
    else if (value.startsWith("--")) throw new Error(`Opción desconocida: ${value}`);
    else if (!args.archive) args.archive = value;
    else throw new Error(`Argumento inesperado: ${value}`);
  }
  if (!args.archive || !args.conversationId) throw new Error("Se requieren el archivo ZIP y --conversation-id.");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(args.conversationId)) {
    throw new Error("--conversation-id debe ser un UUID válido.");
  }
  if (args.dateFormat && !["mdy", "dmy"].includes(args.dateFormat)) throw new Error("--date-format debe ser mdy o dmy.");
  try { new Intl.DateTimeFormat("en-US", { timeZone: args.timezone }); } catch { throw new Error(`Zona horaria inválida: ${args.timezone}`); }
  args.archive = resolve(args.archive);
  return args;
}

function runUnzip(parameters, maxBuffer) {
  try {
    return execFileSync("unzip", parameters, { encoding: null, maxBuffer, stdio: ["ignore", "pipe", "pipe"] });
  } catch (error) {
    const detail = error?.stderr ? Buffer.from(error.stderr).toString("utf8").trim() : error.message;
    throw new Error(`No se pudo leer el ZIP con unzip: ${detail}`);
  }
}

async function sha256File(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

function listArchiveEntries(archive) {
  // BusyBox (imagen web) no implementa `unzip -Z1`; `unzip -l` sí está disponible.
  const listing = runUnzip(["-l", archive], 32 * 1024 * 1024).toString("utf8");
  const entries = listing.split(/\r?\n/u)
    .map((line) => /^\s*\d+\s+\d{2}-\d{2}-\d{4}\s+\d{2}:\d{2}\s+(.+?)\s*$/u.exec(line)?.[1] ?? null)
    .filter((entry) => entry !== null);
  if (entries.length === 0) throw new Error("No se pudieron leer los nombres de archivos del ZIP.");
  return entries;
}

function chooseTextEntry(entries) {
  const candidates = entries.filter((entry) => /\.txt$/iu.test(entry) && !/(^|\/)__MACOSX\//iu.test(entry));
  return candidates.find((entry) => basename(entry).toLowerCase() === "chat.txt")
    ?? candidates.find((entry) => /whatsapp chat with .*\.txt$/iu.test(basename(entry)))
    ?? candidates[0]
    ?? null;
}

function kindFromFilename(name) {
  const ext = name.split(".").at(-1)?.toLowerCase();
  return EXT_KIND.get(ext) ?? "other";
}

function extensionOf(name) {
  return name.split(".").at(-1)?.toLowerCase() ?? "";
}

function basenameKey(name) {
  return basename(name.replaceAll("\\", "/")).normalize("NFKC").toLocaleLowerCase("en-US");
}

function inferDateFormat(headers, explicit) {
  if (explicit) return explicit;
  let sawMdy = false;
  let sawDmy = false;
  for (const h of headers) {
    if (h.first > 12 && h.second <= 12) sawDmy = true;
    if (h.second > 12 && h.first <= 12) sawMdy = true;
  }
  if (sawMdy && sawDmy) throw new Error("El archivo mezcla fechas MDY y DMY; no se importó. Revise el respaldo.");
  if (sawMdy) return "mdy";
  if (sawDmy) return "dmy";
  throw new Error("No se pudo inferir el formato de fecha porque todos los días y meses son ambiguos. Use --date-format mdy o dmy.");
}

function dateParts(first, second, yearText, format) {
  const month = format === "mdy" ? first : second;
  const day = format === "mdy" ? second : first;
  const rawYear = Number(yearText);
  const year = yearText.length === 2 ? (rawYear >= 70 ? 1900 + rawYear : 2000 + rawYear) : rawYear;
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1970 || year > 2100) throw new Error("Fecha fuera de rango.");
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) throw new Error("Fecha inválida.");
  return { year, month, day };
}

function parseTime(text) {
  const compact = text.replace(/[\s.]/gu, "").toLowerCase();
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?(am|pm)?$/u.exec(compact);
  if (!match) throw new Error(`Hora no reconocida: ${text}`);
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3] ?? "0");
  const meridiem = match[4];
  if (meridiem) {
    if (hour < 1 || hour > 12) throw new Error(`Hora fuera de rango: ${text}`);
    if (meridiem === "am") hour %= 12;
    else hour = (hour % 12) + 12;
  }
  if (hour > 23 || minute > 59 || second > 59) throw new Error(`Hora fuera de rango: ${text}`);
  return [hour, minute, second].map((n) => String(n).padStart(2, "0")).join(":");
}

function extractMarkers(body) {
  const attachments = [];
  const markerRegex = /<(?:image omitted|album message|video omitted|audio omitted|voice message omitted|sticker omitted|gif omitted|document omitted|unknown message)>/giu;
  for (const match of body.matchAll(markerRegex)) {
    const marker = match[0].toLowerCase();
    const info = MARKERS.get(marker);
    if (info) attachments.push({ kind: info.kind, marker, label: info.label, fileName: null, sourceEntry: null, state: "unavailable" });
  }

  // WhatsApp pone el nombre original y "(file attached)" cuando el ZIP sí incluye el binario.
  // Se reconocen primero las formas exportadas por WhatsApp y nombres típicos IMG/VID/PTT/etc.
  const filenameRegex = /(?:WhatsApp\s+Image\s+\d{4}-\d{2}-\d{2}\s+at\s+\d{1,2}[._]\d{2}[._]\d{2}(?:\s*[AP]M)?|\b(?:IMG|VID|PTT|AUD|STK|DOC|GIF|WA)[-_][\p{L}\p{N}_-]+)\.(?:jpe?g|png|gif|webp|heic|heif|bmp|mp4|mov|m4v|3gp|avi|webm|opus|ogg|mp3|m4a|aac|wav|pdf|docx?|xlsx?|pptx?|zip|vcf)\s*\(file attached\)/giu;
  const found = new Set();
  for (const match of body.matchAll(filenameRegex)) {
    const filename = match[0].replace(/\s*\(file attached\)$/iu, "").trim();
    const key = basenameKey(filename);
    if (found.has(key)) continue;
    found.add(key);
    attachments.push({ kind: kindFromFilename(filename), marker: null, label: "archivo citado por nombre en el texto", fileName: filename, sourceEntry: null, state: "unavailable" });
  }
  return attachments;
}

function parseExport(text, requestedDateFormat) {
  const sourceLines = text.replace(/^\uFEFF/u, "").split(/\r?\n/u);
  // WhatsApp exports differ by platform and locale. Android commonly wraps
  // timestamps in brackets; iOS exports often use `M/D/YY, h:mm AM - ...`.
  // Keep the same capture groups for both formats so multiline messages are
  // handled identically after the header is recognized.
  const headerRegexes = [
    /^\u200e?\[(\d{1,2})\/(\d{1,2})\/(\d{2,4}),\s*(\d{1,2}:\d{2}(?::\d{2})?\s*(?:a\.?\s*m\.?|p\.?\s*m\.?)?)\]\s?(.*)$/iu,
    /^\u200e?(\d{1,2})\/(\d{1,2})\/(\d{2,4}),\s*(\d{1,2}:\d{2}(?::\d{2})?\s*(?:a\.?\s*m\.?|p\.?\s*m\.?)?)\s+-\s+(.*)$/iu,
  ];
  const headers = [];
  const parsedHeaders = [];
  let current = null;
  let ignoredPreamble = 0;
  let continuationLines = 0;

  for (let i = 0; i < sourceLines.length; i += 1) {
    const line = sourceLines[i];
    const match = headerRegexes.map((regex) => regex.exec(line)).find(Boolean);
    if (!match) {
      if (current) {
        current.bodyLines.push(line);
        continuationLines += 1;
      } else if (line.trim()) ignoredPreamble += 1;
      continue;
    }
    const first = Number(match[1]);
    const second = Number(match[2]);
    const yearText = match[3];
    headers.push({ first, second });
    let content = match[5] ?? "";
    let sender = null;
    let body = content;
    const separator = content.indexOf(": ");
    if (separator >= 0) {
      sender = content.slice(0, separator).trim() || null;
      body = content.slice(separator + 2);
    } else if (content.endsWith(":")) {
      sender = content.slice(0, -1).trim() || null;
      body = "";
    }
    let date = null;
    let time = null;
    try {
      // Fecha a procesar cuando la inferencia global haya terminado.
      time = parseTime(match[4]);
    } catch (error) {
      throw new Error(`Línea ${i + 1}: ${error.message}`);
    }
    current = {
      sourceLine: i + 1,
      sourceOrdinal: parsedHeaders.length + 1,
      first,
      second,
      yearText,
      time,
      sender,
      direction: sender?.toLocaleLowerCase("es-MX") === "you" ? "outbound" : "inbound",
      bodyLines: [body],
      date,
      attachments: [],
    };
    parsedHeaders.push(current);
  }

  const dateFormat = inferDateFormat(headers, requestedDateFormat);
  const messages = parsedHeaders.map((message) => {
    const date = dateParts(message.first, message.second, message.yearText, dateFormat);
    message.localTimestamp = `${date.year}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")} ${message.time}`;
    message.bodyText = message.bodyLines.join("\n");
    message.attachments = extractMarkers(message.bodyText);
    message.senderDisplayName = message.sender ?? "WhatsApp system";
    message.messageKind = message.sender === null ? "system" : message.attachments.length === 1 ? message.attachments[0].kind : message.attachments.length ? "media" : "text";
    return message;
  });

  if (messages.length === 0) throw new Error("No se encontraron mensajes con fecha/hora en el archivo .txt.");
  return { messages, dateFormat, ignoredPreamble, continuationLines, sourceLineCount: sourceLines.length };
}

function normalizeBody(body) {
  return body
    .replace(/^\[Forwarded\]\s*/iu, "")
    .replace(/<(?:image omitted|album message|video omitted|audio omitted|voice message omitted|sticker omitted|gif omitted|document omitted|unknown message)>/giu, " ")
    .replace(/(?:WhatsApp\s+Image\s+\d{4}-\d{2}-\d{2}\s+at\s+\d{1,2}[._]\d{2}[._]\d{2}(?:\s*[AP]M)?|\b(?:IMG|VID|PTT|AUD|STK|DOC|GIF|WA)[-_][\p{L}\p{N}_-]+)\.(?:jpe?g|png|gif|webp|heic|heif|bmp|mp4|mov|m4v|3gp|avi|webm|opus|ogg|mp3|m4a|aac|wav|pdf|docx?|xlsx?|pptx?|zip|vcf)\s*\(file attached\)/giu, " ")
    .normalize("NFKC")
    .replace(/\s+/gu, " ")
    .trim()
    .toLocaleLowerCase("en-US");
}

function senderKey(direction, sender) {
  if (direction === "outbound") return "__outbound__";
  return (sender ?? "").normalize("NFKC").replace(/\s+/gu, " ").trim().toLocaleLowerCase("en-US");
}

function fingerprintFor(conversationId, message) {
  const material = JSON.stringify([
    conversationId,
    message.localTimestamp,
    message.direction,
    (message.senderDisplayName ?? "").normalize("NFKC").replace(/\s+/gu, " ").trim().toLocaleLowerCase("en-US"),
    normalizeBody(message.bodyText),
    [...new Set(message.attachments.map((a) => a.kind))].sort(),
  ]);
  return createHash("sha256").update(material).digest("hex");
}

function mediaKindArrayEqual(a, b) {
  const left = [...a].sort();
  const right = [...b].sort();
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function addOccurrenceNumbers(conversationId, messages) {
  const occurrences = new Map();
  for (const message of messages) {
    message.fingerprint = fingerprintFor(conversationId, message);
    const count = (occurrences.get(message.fingerprint) ?? 0) + 1;
    occurrences.set(message.fingerprint, count);
    message.occurrenceNumber = count;
  }
}

function archiveMediaEntries(entries, textEntry) {
  return entries
    .filter((entry) => !entry.endsWith("/") && !/(^|\/)__MACOSX\//iu.test(entry))
    .filter((entry) => entry !== textEntry)
    .filter((entry) => MEDIA_EXTENSIONS.has(extensionOf(entry)))
    .map((entry) => ({ entry, key: basenameKey(entry), kind: kindFromFilename(entry) }));
}

async function hashAndMaybeUpload(archive, entry, archiveSha, minio, uploadedShas, apply) {
  const data = runUnzip(["-p", archive, entry], MAX_MEDIA_BYTES + 1);
  if (data.length > MAX_MEDIA_BYTES) throw new Error(`El archivo ${basename(entry)} excede el límite de ${MAX_MEDIA_BYTES} bytes.`);
  const sha256 = createHash("sha256").update(data).digest("hex");
  if (apply && !uploadedShas.has(sha256)) {
    const bucket = process.env.WA_CAPTURE_MINIO_BUCKET || "whatsapp-media";
    const objectKey = `sha256/${sha256.slice(0, 2)}/${sha256}`;
    if (!(await minio.bucketExists(bucket))) await minio.makeBucket(bucket);
    let exists = true;
    try { await minio.statObject(bucket, objectKey); } catch (error) {
      if (error?.code === "NotFound" || error?.statusCode === 404) exists = false;
      else throw error;
    }
    if (!exists) await minio.putObject(bucket, objectKey, data, data.length, { "Content-Type": contentTypeFor(entry), "x-amz-meta-sha256": sha256 });
    uploadedShas.add(sha256);
  }
  return { sha256, sizeBytes: data.length, contentType: contentTypeFor(entry), bucket: process.env.WA_CAPTURE_MINIO_BUCKET || "whatsapp-media" };
}

function contentTypeFor(name) {
  const ext = extensionOf(name);
  const types = {
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp",
    heic: "image/heic", heif: "image/heif", bmp: "image/bmp", mp4: "video/mp4", mov: "video/quicktime",
    m4v: "video/x-m4v", "3gp": "video/3gpp", avi: "video/x-msvideo", webm: "video/webm", opus: "audio/opus",
    ogg: "audio/ogg", mp3: "audio/mpeg", m4a: "audio/mp4", aac: "audio/aac", wav: "audio/wav",
    pdf: "application/pdf", doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ppt: "application/vnd.ms-powerpoint", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    txt: "text/plain", zip: "application/zip", vcf: "text/vcard",
  };
  return types[ext] ?? "application/octet-stream";
}

function createMinioClient() {
  const endpoint = process.env.MINIO_ENDPOINT ?? "localhost:9000";
  const [host, portText] = endpoint.split(":");
  return new MinioClient({
    endPoint: host,
    port: portText ? Number(portText) : 9000,
    useSSL: false,
    accessKey: process.env.S3_ACCESS_KEY ?? "",
    secretKey: process.env.S3_SECRET_KEY ?? "",
    pathStyle: true,
  });
}

async function findLiveMessages(client, conversationId, timezone, messages) {
  const min = messages.map((m) => m.localTimestamp).sort()[0];
  const max = messages.map((m) => m.localTimestamp).sort().at(-1);
  const { rows } = await client.query(
    `SELECT m.id, m.direction::text AS direction, m.sender_display_name,
            m.body_text, to_char(COALESCE(m.sent_at, m.received_at) AT TIME ZONE $2, 'YYYY-MM-DD HH24:MI:SS') AS local_timestamp,
            COALESCE(array_agg(mm.media_kind::text ORDER BY mm.ordinal) FILTER (WHERE mm.id IS NOT NULL), ARRAY[]::text[]) AS media_kinds,
            COALESCE(bool_or(mm.state = 'unavailable'), false) AS has_unavailable_media
       FROM whatsapp_capture.messages m
       LEFT JOIN whatsapp_capture.message_media mm ON mm.message_id = m.id
      WHERE m.conversation_id = $1
        AND COALESCE(m.sent_at, m.received_at) >= ($3::timestamp AT TIME ZONE $2)
        AND COALESCE(m.sent_at, m.received_at) < (($4::timestamp + interval '1 second') AT TIME ZONE $2)
      GROUP BY m.id`,
    [conversationId, timezone, min, max]
  );
  return rows.map((row) => ({
    ...row,
    sender_key: senderKey(row.direction, row.sender_display_name),
    body_key: normalizeBody(row.body_text ?? ""),
    media_kinds: row.media_kinds ?? [],
    has_unavailable_media: row.has_unavailable_media,
    claimed: false,
  }));
}

function planMessageMatches(messages, liveMessages, keysByFingerprint) {
  const ambiguous = [];
  const counts = { overlap: 0, matchedLive: 0, inserted: 0 };
  for (const message of messages) {
    const existing = keysByFingerprint.get(`${message.fingerprint}:${message.occurrenceNumber}`);
    if (existing) {
      message.messageId = existing.message_id;
      message.disposition = "overlap";
      counts.overlap += 1;
      continue;
    }

    const expectedSenderKey = senderKey(message.direction, message.senderDisplayName);
    const isAlbum = message.attachments.some((attachment) => attachment.marker === "<album message>");
    const candidates = liveMessages.filter((live) => !live.claimed
      && live.local_timestamp === message.localTimestamp
      && live.direction === message.direction
      && live.body_key === normalizeBody(message.bodyText)
      && (message.attachments.length === 0 || live.media_kinds.length === 0 || live.has_unavailable_media
        || (isAlbum ? live.media_kinds.includes("image") : mediaKindArrayEqual(live.media_kinds, message.attachments.map((a) => a.kind)))));
    const exactSender = candidates.filter((live) => live.sender_key === expectedSenderKey);
    if (exactSender.length === 1) {
      exactSender[0].claimed = true;
      message.messageId = exactSender[0].id;
      message.disposition = "matched_live";
      counts.matchedLive += 1;
    } else if (exactSender.length > 1 || candidates.length > 0) {
      message.disposition = "ambiguous";
      ambiguous.push({ sourceLine: message.sourceLine, at: message.localTimestamp, sender: message.senderDisplayName, candidates: candidates.length });
    } else {
      message.disposition = "inserted";
      counts.inserted += 1;
    }
  }
  return { ambiguous, counts };
}

function summarize(messages, archiveFiles, parseInfo, matchInfo, extra = {}) {
  const attachmentCounts = {};
  const markerCounts = {};
  const examples = [];
  for (const message of messages) {
    for (const attachment of message.attachments) {
      attachmentCounts[attachment.kind] = (attachmentCounts[attachment.kind] ?? 0) + 1;
      if (attachment.marker) markerCounts[attachment.marker] = (markerCounts[attachment.marker] ?? 0) + 1;
      if (attachment.kind === "image" && examples.length < 12) {
        examples.push({ date: message.localTimestamp, sender: message.senderDisplayName, marker: attachment.marker, sourceLine: message.sourceLine });
      }
    }
  }
  return {
    mode: extra.apply ? "apply" : "dry-run",
    text_format: parseInfo.dateFormat,
    timezone: extra.timezone,
    source: {
      messages: messages.length,
      text_lines: parseInfo.sourceLineCount,
      continuation_lines: parseInfo.continuationLines,
      ignored_preamble_lines: parseInfo.ignoredPreamble,
      media_entries: archiveFiles.length,
      media_markers_and_references: Object.values(attachmentCounts).reduce((a, b) => a + b, 0),
    },
    messages: {
      inserted: matchInfo.counts.inserted,
      matched_live: matchInfo.counts.matchedLive,
      overlap: matchInfo.counts.overlap,
      ambiguous: matchInfo.ambiguous.length,
    },
    attachments: {
      by_kind: attachmentCounts,
      markers: markerCounts,
      examples_missing_images: examples,
      files_without_message_match: extra.orphanEntries ?? [],
      ambiguous_names: extra.ambiguousEntries ?? [],
      unavailable: extra.unavailable ?? 0,
      stored: extra.stored ?? 0,
    },
    incomplete: matchInfo.ambiguous.length > 0 || (extra.unavailable ?? 0) > 0 || (extra.ambiguousEntries?.length ?? 0) > 0,
  };
}

async function main() {
  let args;
  try { args = parseArgs(process.argv.slice(2)); } catch (error) { console.error(error.message); usage(); process.exit(2); }
  const connectionString = process.env.DATABASE_URL
    ?? `postgres://${process.env.POSTGRES_USER}:${process.env.POSTGRES_PASSWORD}@${process.env.PGHOST ?? "localhost"}:${process.env.PGPORT ?? "5433"}/${process.env.POSTGRES_DB}`;
  const pool = new Pool({ connectionString, max: 2 });
  const archiveSha = await sha256File(args.archive);
  const entries = listArchiveEntries(args.archive);
  const textEntry = chooseTextEntry(entries);
  if (!textEntry) throw new Error("El ZIP no contiene un archivo .txt de conversación.");
  const textBytes = runUnzip(["-p", args.archive, textEntry], MAX_TEXT_BYTES + 1);
  if (textBytes.length > MAX_TEXT_BYTES) throw new Error("El texto exportado excede el límite de análisis de 32 MiB.");
  const textSha = createHash("sha256").update(textBytes).digest("hex");
  const exportText = textBytes.toString("utf8");
  const parsed = parseExport(exportText, args.dateFormat);
  const mediaEntries = archiveMediaEntries(entries, textEntry);
  const mediaByName = new Map();
  for (const item of mediaEntries) {
    const bucket = mediaByName.get(item.key) ?? [];
    bucket.push(item);
    mediaByName.set(item.key, bucket);
  }

  const referencedEntries = new Set();
  const ambiguousEntries = [];
  for (const message of parsed.messages) {
    for (const attachment of message.attachments) {
      if (!attachment.fileName) continue;
      const candidates = mediaByName.get(basenameKey(attachment.fileName)) ?? [];
      if (candidates.length === 1) {
        attachment.sourceEntry = candidates[0].entry;
        attachment.state = "stored";
        referencedEntries.add(candidates[0].entry);
      } else if (candidates.length > 1) {
        attachment.state = "ambiguous";
        attachment.detail = `Hay ${candidates.length} archivos ZIP con el mismo nombre base.`;
        for (const item of candidates) ambiguousEntries.push(item.entry);
      } else {
        attachment.detail = `El texto cita ${attachment.fileName}, pero el ZIP no incluye ese archivo.`;
      }
    }
  }
  const orphanEntries = mediaEntries.filter((item) => !referencedEntries.has(item.entry) && !ambiguousEntries.includes(item.entry)).map((item) => item.entry);

  addOccurrenceNumbers(args.conversationId, parsed.messages);

  try {
    const conversation = await pool.query(
      `SELECT id, display_name FROM whatsapp_capture.conversations WHERE id = $1`,
      [args.conversationId]
    );
    if (!conversation.rows[0]) throw new Error(`No existe la conversación ${args.conversationId} en WhatsApp Capture.`);

    const previousBatch = await pool.query(
      `SELECT id, status, total_messages, report FROM whatsapp_capture.export_batches
        WHERE conversation_id = $1 AND archive_sha256 = $2`,
      [args.conversationId, archiveSha]
    );
    if (previousBatch.rows.length) {
      console.log(JSON.stringify({ already_imported: true, batch: previousBatch.rows[0] }, null, 2));
      return;
    }

    const fps = [...new Set(parsed.messages.map((message) => message.fingerprint))];
    const knownKeys = await pool.query(
      `SELECT fingerprint, occurrence_number, message_id
         FROM whatsapp_capture.export_message_keys
        WHERE conversation_id = $1 AND fingerprint = ANY($2::char(64)[])`,
      [args.conversationId, fps]
    );
    const keysByFingerprint = new Map(knownKeys.rows.map((row) => [`${row.fingerprint.trim()}:${row.occurrence_number}`, row]));
    const liveMessages = await findLiveMessages(pool, args.conversationId, args.timezone, parsed.messages);
    const matches = planMessageMatches(parsed.messages, liveMessages, keysByFingerprint);
    const descriptors = new Map();
    const minio = args.apply ? createMinioClient() : null;
    const uploadedShas = new Set();
    let unavailable = 0;
    let stored = 0;
    let ambiguousCount = 0;

    for (const message of parsed.messages) {
      for (const attachment of message.attachments) {
        if (attachment.state === "ambiguous") {
          ambiguousCount += 1;
          continue;
        }
        if (!attachment.sourceEntry) {
          unavailable += 1;
          continue;
        }
        let descriptor = descriptors.get(attachment.sourceEntry);
        if (!descriptor) {
          descriptor = await hashAndMaybeUpload(args.archive, attachment.sourceEntry, archiveSha, minio, uploadedShas, false);
          descriptors.set(attachment.sourceEntry, descriptor);
        }
        attachment.descriptor = descriptor;
        stored += 1;
      }
    }

    const report = summarize(parsed.messages, mediaEntries, parsed, matches, {
      apply: args.apply,
      timezone: args.timezone,
      orphanEntries,
      ambiguousEntries: [...new Set(ambiguousEntries)],
      unavailable,
      stored,
    });
    report.source.text_file = textEntry;
    report.source.archive_sha256 = archiveSha;
    report.source.text_sha256 = textSha;
    report.source.filename = basename(args.archive);
    report.attachments.ambiguous_references = ambiguousCount;
    report.match_review = matches.ambiguous;
    report.warnings = [];
    if (orphanEntries.length) report.warnings.push(`${orphanEntries.length} multimedia binario(s) del ZIP no se vincularon a un mensaje.`);
    if (ambiguousCount || ambiguousEntries.length) report.warnings.push("Hay nombres de archivos ambiguos; se requiere conciliación manual.");
    if (!args.apply) {
      console.log(JSON.stringify(report, null, 2));
      return;
    }
    if (matches.ambiguous.length || ambiguousCount || ambiguousEntries.length) {
      console.log(JSON.stringify(report, null, 2));
      throw new Error("No se aplicó el respaldo porque hay mensajes o archivos con coincidencias ambiguas.");
    }

    for (const [entry, expected] of descriptors) {
      const actual = await hashAndMaybeUpload(args.archive, entry, archiveSha, minio, uploadedShas, true);
      if (actual.sha256 !== expected.sha256 || actual.sizeBytes !== expected.sizeBytes) {
        throw new Error(`El archivo ${basename(entry)} cambió durante la importación; no se aplicó el lote.`);
      }
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))", [args.conversationId, archiveSha]);
      const racedBatch = await client.query(
        `SELECT id FROM whatsapp_capture.export_batches WHERE conversation_id = $1 AND archive_sha256 = $2`,
        [args.conversationId, archiveSha]
      );
      if (racedBatch.rows.length) {
        await client.query("ROLLBACK");
        console.log(JSON.stringify({ already_imported: true, batch_id: racedBatch.rows[0].id }, null, 2));
        return;
      }
      const batchIdResult = await client.query(
        `INSERT INTO whatsapp_capture.export_batches
           (conversation_id, source_filename, archive_sha256, text_sha256, timezone_name, date_format,
            status, total_messages, inserted_messages, matched_messages, unavailable_media, stored_media, report, completed_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, now())
         RETURNING id`,
        [args.conversationId, basename(args.archive), archiveSha, textSha, args.timezone, parsed.dateFormat,
          report.incomplete ? "partial" : "imported", parsed.messages.length, matches.counts.inserted,
          matches.counts.matchedLive + matches.counts.overlap, unavailable, stored, JSON.stringify(report)]
      );
      const batchId = batchIdResult.rows[0].id;
      const messageIds = new Map();

      for (const message of parsed.messages) {
        let messageId = message.messageId;
        if (message.disposition === "inserted") {
          const extId = `export:${message.fingerprint}:${message.occurrenceNumber}`;
          const inserted = await client.query(
            `INSERT INTO whatsapp_capture.messages
               (conversation_id, external_message_id, direction, sender_id, sender_display_name,
                body_text, message_kind, sent_at, provider_metadata)
             VALUES ($1, $2, $3::whatsapp_capture.message_direction, NULL, $4, $5, $6,
                     ($7::timestamp AT TIME ZONE $8), $9::jsonb)
             ON CONFLICT (conversation_id, external_message_id, direction) DO NOTHING
             RETURNING id`,
            [args.conversationId, extId, message.direction, message.senderDisplayName, message.bodyText,
              message.messageKind, message.localTimestamp, args.timezone,
              JSON.stringify({ source: "whatsapp_export", source_file: basename(args.archive), source_line: message.sourceLine, timezone: args.timezone })]
          );
          messageId = inserted.rows[0]?.id;
          if (!messageId) {
            const existing = await client.query(
              `SELECT id FROM whatsapp_capture.messages WHERE conversation_id = $1 AND external_message_id = $2 AND direction = $3`,
              [args.conversationId, extId, message.direction]
            );
            messageId = existing.rows[0]?.id;
          }
          if (!messageId) throw new Error(`No se pudo insertar el mensaje de la línea ${message.sourceLine}.`);
        }
        messageIds.set(message.sourceOrdinal, messageId);

        const keyInsert = await client.query(
          `INSERT INTO whatsapp_capture.export_message_keys
             (conversation_id, fingerprint, occurrence_number, message_id, first_batch_id, source_ordinal, source_line)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (conversation_id, fingerprint, occurrence_number) DO NOTHING
           RETURNING message_id`,
          [args.conversationId, message.fingerprint, message.occurrenceNumber, messageId, batchId, message.sourceOrdinal, message.sourceLine]
        );
        if (!keyInsert.rows[0]) {
          const existing = await client.query(
            `SELECT message_id FROM whatsapp_capture.export_message_keys
              WHERE conversation_id = $1 AND fingerprint = $2 AND occurrence_number = $3`,
            [args.conversationId, message.fingerprint, message.occurrenceNumber]
          );
          if (existing.rows[0]?.message_id !== messageId) throw new Error(`Conflicto de deduplicación en línea ${message.sourceLine}.`);
        }
        await client.query(
          `INSERT INTO whatsapp_capture.export_batch_messages
             (batch_id, source_ordinal, source_line, message_id, fingerprint, occurrence_number, disposition)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [batchId, message.sourceOrdinal, message.sourceLine, messageId, message.fingerprint, message.occurrenceNumber, message.disposition]
        );
      }

      const mediaObjectMap = new Map();
      for (const [entry, descriptor] of descriptors) {
        await client.query(
          `INSERT INTO whatsapp_capture.media_objects
             (sha256, bucket, object_key, content_type, size_bytes, state, stored_at)
           VALUES ($1, $2, $3, $4, $5, 'stored', now())
           ON CONFLICT (sha256) DO UPDATE SET
             bucket = EXCLUDED.bucket, object_key = EXCLUDED.object_key,
             content_type = COALESCE(whatsapp_capture.media_objects.content_type, EXCLUDED.content_type),
             size_bytes = EXCLUDED.size_bytes, state = 'stored', stored_at = COALESCE(whatsapp_capture.media_objects.stored_at, now()), last_error = NULL`,
          [descriptor.sha256, descriptor.bucket, `sha256/${descriptor.sha256.slice(0, 2)}/${descriptor.sha256}`, descriptor.contentType, descriptor.sizeBytes]
        );
        mediaObjectMap.set(entry, descriptor);
      }

      for (const message of parsed.messages) {
        const messageId = messageIds.get(message.sourceOrdinal);
        for (let attachmentOrdinal = 0; attachmentOrdinal < message.attachments.length; attachmentOrdinal += 1) {
          const attachment = message.attachments[attachmentOrdinal];
          const descriptor = attachment.descriptor ?? null;
          let mediaRow = await client.query(
            `SELECT id, sha256, state FROM whatsapp_capture.message_media WHERE message_id = $1 AND ordinal = $2`,
            [messageId, attachmentOrdinal]
          );
          let messageMediaId = mediaRow.rows[0]?.id ?? null;
          let state = attachment.state;
          let sha256 = descriptor?.sha256 ?? null;
          if (mediaRow.rows[0]) {
            const current = mediaRow.rows[0];
            const currentSha = current.sha256?.trim() ?? null;
            if (current.state === "stored" && currentSha && (!sha256 || currentSha === sha256)) {
              state = "stored";
              sha256 = currentSha;
            } else if (current.state === "stored" && currentSha && sha256 && currentSha !== sha256) {
              throw new Error(`El adjunto de línea ${message.sourceLine}, posición ${attachmentOrdinal}, difiere del binario ya guardado.`);
            } else if (descriptor) {
              await client.query(
                `UPDATE whatsapp_capture.message_media
                    SET file_name = COALESCE($3, file_name), media_kind = $4::whatsapp_capture.media_kind,
                        content_type = $5, size_bytes = $6, sha256 = $7, state = 'stored', last_error = NULL, updated_at = now()
                  WHERE id = $1 AND message_id = $2`,
                [messageMediaId, messageId, attachment.fileName, attachment.kind, descriptor.contentType, descriptor.sizeBytes, descriptor.sha256]
              );
              state = "stored";
              sha256 = descriptor.sha256;
            } else if (current.state === "unavailable") {
              await client.query(
                `UPDATE whatsapp_capture.message_media
                    SET file_name = COALESCE($2, file_name), media_kind = $3::whatsapp_capture.media_kind,
                        last_error = $4, updated_at = now()
                  WHERE id = $1`,
                [messageMediaId, attachment.fileName, attachment.kind,
                  attachment.marker ? `export_marker:${attachment.marker}` : attachment.detail ?? "media_binary_not_in_zip"]
              );
            } else if (current.state !== "unavailable" && state === "unavailable") {
              state = current.state;
            }
          } else {
            const result = await client.query(
              `INSERT INTO whatsapp_capture.message_media
                 (message_id, ordinal, file_name, media_kind, content_type, size_bytes, sha256, state, last_error)
               VALUES ($1, $2, $3, $4::whatsapp_capture.media_kind, $5, $6, $7, $8::whatsapp_capture.media_state, $9)
               RETURNING id`,
              [messageId, attachmentOrdinal, attachment.fileName, attachment.kind,
                descriptor?.contentType ?? null, descriptor?.sizeBytes ?? null, descriptor?.sha256 ?? null,
                state, state === "unavailable" ? (attachment.marker ? `export_marker:${attachment.marker}` : attachment.detail ?? "media_binary_not_in_zip") : null]
            );
            messageMediaId = result.rows[0].id;
          }
          await client.query(
            `INSERT INTO whatsapp_capture.export_batch_attachments
               (batch_id, source_ordinal, attachment_ordinal, message_id, message_media_id, source_entry, media_kind, sha256, state, detail)
             VALUES ($1, $2, $3, $4, $5, $6, $7::whatsapp_capture.media_kind, $8, $9, $10)`,
            [batchId, message.sourceOrdinal, attachmentOrdinal, messageId, messageMediaId, attachment.sourceEntry,
              attachment.kind, sha256, state,
              attachment.marker ? `${attachment.label}; marcador ${attachment.marker}` : attachment.detail ?? null]
          );
        }
      }

      for (const item of mediaEntries) {
        const descriptor = descriptors.get(item.entry) ?? null;
        const state = descriptor ? "stored" : ambiguousEntries.includes(item.entry) ? "ambiguous" : "orphan";
        await client.query(
          `INSERT INTO whatsapp_capture.export_batch_files
             (batch_id, source_entry, media_kind, sha256, size_bytes, state, detail)
           VALUES ($1, $2, $3::whatsapp_capture.media_kind, $4, $5, $6, $7)`,
          [batchId, item.entry, item.kind, descriptor?.sha256 ?? null, descriptor?.sizeBytes ?? null, state,
            state === "orphan" ? "No se encontró una referencia inequívoca a este archivo en el texto exportado." : state === "ambiguous" ? "Nombre base repetido en el ZIP." : null]
        );
      }

      await client.query(
        `UPDATE whatsapp_capture.conversations
            SET last_message_at = GREATEST(last_message_at, (SELECT max(sent_at) FROM whatsapp_capture.messages WHERE conversation_id = $1)), updated_at = now()
          WHERE id = $1`,
        [args.conversationId]
      );
      await client.query("COMMIT");
      console.log(JSON.stringify({ ...report, batch_id: batchId, status: report.incomplete ? "partial" : "imported" }, null, 2));
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(`Error al importar el respaldo: ${error.message}`);
  process.exitCode = 1;
});
