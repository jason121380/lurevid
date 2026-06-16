import { prisma } from "@/lib/prisma";

type SettingField = {
  key: string;
  label: string;
  secret: boolean;
  defaultValue?: string;
  placeholder?: string;
  envFallback: boolean;
};

export const APP_SETTING_FIELDS = [
  { key: "OPENAI_API_KEY", label: "OpenAI API Key", secret: true, envFallback: true },
  { key: "OPENAI_STORY_MODEL", label: "OpenAI 分析模型", secret: false, defaultValue: "gpt-5.4-mini", envFallback: true },
  { key: "OPENAI_PROMPT_MODEL", label: "OpenAI Prompt 模型", secret: false, defaultValue: "gpt-5.4-mini", envFallback: true },
  { key: "OPENAI_IMAGE_MODEL", label: "OpenAI 圖像模型", secret: false, defaultValue: "gpt-image-2", envFallback: true },
  { key: "OPENAI_TRANSCRIBE_MODEL", label: "OpenAI 轉錄模型", secret: false, defaultValue: "gpt-4o-transcribe", envFallback: true },
  { key: "ARK_API_KEY", label: "BytePlus ModelArk API Key", secret: true, envFallback: true },
  {
    key: "ARK_BASE_URL",
    label: "BytePlus ModelArk Base URL",
    secret: false,
    defaultValue: "https://ark.ap-southeast.bytepluses.com/api/v3",
    placeholder: "https://ark.ap-southeast.bytepluses.com/api/v3",
    envFallback: true
  },
  {
    key: "SEEDANCE_MODEL",
    label: "Seedance 模型",
    secret: false,
    defaultValue: "dreamina-seedance-2-0-260128",
    envFallback: true
  },
  {
    key: "S3_ENDPOINT",
    label: "R2 Endpoint",
    secret: false,
    placeholder: "https://<account_id>.r2.cloudflarestorage.com",
    envFallback: true
  },
  { key: "S3_REGION", label: "R2 Region（用 auto）", secret: false, defaultValue: "auto", envFallback: true },
  { key: "S3_BUCKET", label: "R2 Bucket", secret: false, placeholder: "lurevid", envFallback: true },
  {
    key: "S3_ACCESS_KEY_ID",
    label: "R2 Access Key ID（API Token）",
    secret: true,
    placeholder: "R2 API Token 的 Access Key ID",
    envFallback: true
  },
  {
    key: "S3_SECRET_ACCESS_KEY",
    label: "R2 Secret Access Key（API Token）",
    secret: true,
    placeholder: "R2 API Token 的 Secret Access Key",
    envFallback: true
  },
  {
    key: "S3_PUBLIC_URL",
    label: "R2 公開網址",
    secret: false,
    placeholder: "https://pub-xxxx.r2.dev 或自訂網域",
    envFallback: true
  },
  { key: "S3_FORCE_PATH_STYLE", label: "R2 Force Path Style（用 false）", secret: false, defaultValue: "false", envFallback: true }
] as const satisfies readonly SettingField[];

export type AppSettingKey = (typeof APP_SETTING_FIELDS)[number]["key"];

const fieldByKey = new Map(APP_SETTING_FIELDS.map((field) => [field.key, field]));

function isPlaceholder(value: string | undefined) {
  return !value || value === "sk-..." || value.startsWith("your-") || value.startsWith("https://<") || value.startsWith("replace-with");
}

function defaultValue(field: SettingField) {
  return field.defaultValue || "";
}

// 短 TTL 進程內快取：getAppSettings 在 worker 的上傳/多 scene 路徑會被重複呼叫。
const SETTINGS_CACHE_TTL_MS = Number(process.env.SETTINGS_CACHE_TTL_MS || 5000);
let settingsCache: { value: Record<AppSettingKey, string>; expiresAt: number } | null = null;

export function invalidateAppSettingsCache() {
  settingsCache = null;
}

export async function getAppSettings() {
  if (settingsCache && settingsCache.expiresAt > Date.now()) {
    return settingsCache.value;
  }

  const rows = await prisma.appSetting.findMany();
  const fromDb = new Map(rows.map((row) => [row.key, row.value]));

  const value = Object.fromEntries(
    APP_SETTING_FIELDS.map((field) => {
      const dbValue = fromDb.get(field.key);
      const envValue = field.envFallback ? process.env[field.key] : undefined;
      const resolved = dbValue || (!isPlaceholder(envValue) ? envValue : undefined) || defaultValue(field);
      return [field.key, resolved];
    })
  ) as Record<AppSettingKey, string>;

  settingsCache = { value, expiresAt: Date.now() + SETTINGS_CACHE_TTL_MS };
  return value;
}

export async function getAppSetting(key: AppSettingKey) {
  return (await getAppSettings())[key];
}

export function publicSettingFields() {
  return APP_SETTING_FIELDS.map((field) => ({
    key: field.key,
    label: field.label,
    secret: field.secret,
    defaultValue: defaultValue(field),
    placeholder: (field as { placeholder?: string }).placeholder || ""
  }));
}

export function maskSecret(value: string) {
  if (!value) return "";
  if (value.length <= 8) return "••••••••";
  return `${value.slice(0, 4)}••••${value.slice(-4)}`;
}

export async function saveAppSettings(values: Partial<Record<AppSettingKey, string>>) {
  const updates = Object.entries(values).filter(([key]) => fieldByKey.has(key as AppSettingKey));

  await prisma.$transaction(
    updates.map(([key, rawValue]) => {
      const value = rawValue?.trim() || "";
      if (!value) return prisma.appSetting.deleteMany({ where: { key } });
      return prisma.appSetting.upsert({
        where: { key },
        update: { value },
        create: { key, value }
      });
    })
  );

  invalidateAppSettingsCache();
}
