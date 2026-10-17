import { Client } from "minio";

let client: Client | undefined;

function minio(): Client {
  if (!client) {
    const endpoint = process.env.MINIO_ENDPOINT ?? "localhost:9000";
    const [host, portStr] = endpoint.split(":");
    client = new Client({
      endPoint: host,
      port: portStr ? Number(portStr) : 9000,
      useSSL: false,
      accessKey: process.env.S3_ACCESS_KEY ?? "",
      secretKey: process.env.S3_SECRET_KEY ?? "",
      pathStyle: true,
    });
  }
  return client;
}

export function storageBucket(): string {
  return process.env.S3_BUCKET ?? "seguimiento";
}

export async function putStorageObject(key: string, data: Buffer, mimeType: string) {
  await minio().putObject(storageBucket(), key, data, data.length, {
    "Content-Type": mimeType,
  });
}

export async function storageDownloadUrl(key: string): Promise<string> {
  return minio().presignedGetObject(storageBucket(), key, 5 * 60);
}

/** Bucket donde el plugin de capture deja los binarios de WhatsApp. */
export function whatsappBucket(): string {
  return process.env.WHATSAPP_MEDIA_BUCKET ?? "whatsapp-media";
}

/** Bucket dedicado a los ZIP de respaldo, separados del multimedia consultable. */
export function whatsappBackupBucket(): string {
  return process.env.WHATSAPP_BACKUP_BUCKET ?? "whatsapp-backups";
}

export async function putStorageFileInBucket(
  bucket: string,
  key: string,
  filePath: string,
  metadata: Record<string, string>
) {
  await minio().fPutObject(bucket, key, filePath, metadata);
}

export async function storageDownloadUrlInBucket(bucket: string, key: string, expirySeconds = 5 * 60): Promise<string> {
  return minio().presignedGetObject(bucket, key, expirySeconds);
}

export async function deleteStorageObject(key: string) {
  await minio().removeObject(storageBucket(), key);
}

export async function deleteStorageObjectInBucket(bucket: string, key: string) {
  await minio().removeObject(bucket, key);
}

/** ¿Existe ya el objeto en el bucket principal? (para caché de miniaturas). */
export async function storageObjectExists(key: string): Promise<boolean> {
  try {
    await minio().statObject(storageBucket(), key);
    return true;
  } catch {
    return false;
  }
}

export async function storageObjectExistsInBucket(bucket: string, key: string): Promise<boolean> {
  try {
    await minio().statObject(bucket, key);
    return true;
  } catch {
    return false;
  }
}

/** Descarga un objeto como Buffer desde cualquier bucket. */
export async function getStorageObjectBuffer(bucket: string, key: string): Promise<Buffer> {
  const url = await storageDownloadUrlInBucket(bucket, key, 5 * 60);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`No se pudo descargar ${bucket}/${key}`);
  return Buffer.from(await res.arrayBuffer());
}
