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

export async function deleteStorageObject(key: string) {
  await minio().removeObject(storageBucket(), key);
}