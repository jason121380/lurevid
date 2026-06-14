import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { getAppSettings } from "@/lib/settings";

function hasS3Credentials(settings: Awaited<ReturnType<typeof getAppSettings>>) {
  return Boolean(settings.S3_ACCESS_KEY_ID && settings.S3_SECRET_ACCESS_KEY && settings.S3_BUCKET && settings.S3_PUBLIC_URL);
}

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

async function uploadLocalObject(key: string, body: Buffer) {
  const root = resolve(process.env.LOCAL_PUBLIC_STORAGE_DIR || "public/generated");
  const safeKey = key.replace(/^\/+/, "");
  const path = resolve(root, safeKey);
  if (!path.startsWith(root)) throw new Error("不合法的本機儲存路徑");
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, body);
  return `/${(process.env.LOCAL_PUBLIC_STORAGE_PREFIX || "generated").replace(/^\/+|\/+$/g, "")}/${safeKey}`;
}

/** 上傳一個物件到 S3 相容儲存，回傳可公開存取的網址。 */
export async function uploadObject(key: string, body: Buffer, contentType: string) {
  const settings = await getAppSettings();
  if (!hasS3Credentials(settings)) {
    return uploadLocalObject(key, body);
  }

  await (await client()).send(
    new PutObjectCommand({
      Bucket: settings.S3_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: "public, max-age=31536000, immutable"
    })
  );
  return objectPublicUrl(key);
}
