import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

let cachedClient: S3Client | null = null;

function client() {
  if (cachedClient) return cachedClient;

  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
  if (!accessKeyId || !secretAccessKey) {
    throw new Error("請先在 .env 設定 S3_ACCESS_KEY_ID 與 S3_SECRET_ACCESS_KEY");
  }

  cachedClient = new S3Client({
    region: process.env.S3_REGION || "auto",
    endpoint: process.env.S3_ENDPOINT || undefined,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
    credentials: { accessKeyId, secretAccessKey }
  });
  return cachedClient;
}

function bucket() {
  const name = process.env.S3_BUCKET;
  if (!name) throw new Error("缺少 S3_BUCKET");
  return name;
}

export function objectPublicUrl(key: string) {
  const base = process.env.S3_PUBLIC_URL;
  if (!base) throw new Error("缺少 S3_PUBLIC_URL");
  return `${base.replace(/\/+$/, "")}/${key.replace(/^\/+/, "")}`;
}

/** 上傳一個物件到 S3 相容儲存，回傳可公開存取的網址。 */
export async function uploadObject(key: string, body: Buffer, contentType: string) {
  await client().send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: "public, max-age=31536000, immutable"
    })
  );
  return objectPublicUrl(key);
}
