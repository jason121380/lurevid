import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getAppSettings } from "@/lib/settings";

async function client() {
  const settings = await getAppSettings();
  const accessKeyId = settings.S3_ACCESS_KEY_ID;
  const secretAccessKey = settings.S3_SECRET_ACCESS_KEY;
  if (!accessKeyId || !secretAccessKey) {
    throw new Error("請先在設定頁填入 S3_ACCESS_KEY_ID 與 S3_SECRET_ACCESS_KEY");
  }

  return new S3Client({
    region: settings.S3_REGION || "auto",
    endpoint: settings.S3_ENDPOINT || undefined,
    forcePathStyle: settings.S3_FORCE_PATH_STYLE === "true",
    credentials: { accessKeyId, secretAccessKey }
  });
}

async function bucket() {
  const name = (await getAppSettings()).S3_BUCKET;
  if (!name) throw new Error("缺少 S3_BUCKET");
  return name;
}

export async function objectPublicUrl(key: string) {
  const base = (await getAppSettings()).S3_PUBLIC_URL;
  if (!base) throw new Error("缺少 S3_PUBLIC_URL");
  return `${base.replace(/\/+$/, "")}/${key.replace(/^\/+/, "")}`;
}

/** 上傳一個物件到 S3 相容儲存，回傳可公開存取的網址。 */
export async function uploadObject(key: string, body: Buffer, contentType: string) {
  await (await client()).send(
    new PutObjectCommand({
      Bucket: await bucket(),
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: "public, max-age=31536000, immutable"
    })
  );
  return objectPublicUrl(key);
}
