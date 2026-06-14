import { prisma } from "@/lib/prisma";

type SettingField = {
  key: string;
  label: string;
  secret: boolean;
  defaultValue?: string;
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
    key: "SEEDANCE_MODEL",
    label: "Seedance 模型",
    secret: false,
    defaultValue: "dreamina-seedance-2-0-fast-260128",
    envFallback: true
  },
  { key: "S3_ENDPOINT", label: "S3 Endpoint", secret: false, envFallback: true },
  { key: "S3_REGION", label: "S3 Region", secret: false, defaultValue: "auto", envFallback: true },
  { key: "S3_BUCKET", label: "S3 Bucket", secret: false, envFallback: true },
  { key: "S3_ACCESS_KEY_ID", label: "S3 Access Key ID", secret: true, envFallback: true },
  { key: "S3_SECRET_ACCESS_KEY", label: "S3 Secret Access Key", secret: true, envFallback: true },
  { key: "S3_PUBLIC_URL", label: "S3 Public URL", secret: false, envFallback: true },
  { key: "S3_FORCE_PATH_STYLE", label: "S3 Force Path Style", secret: false, defaultValue: "false", envFallback: true }
] as const satisfies readonly SettingField[];

export type AppSettingKey = (typeof APP_SETTING_FIELDS)[number]["key"];

const fieldByKey = new Map(APP_SETTING_FIELDS.map((field) => [field.key, field]));

function isPlaceholder(value: string | undefined) {
  return !value || value === "sk-..." || value.startsWith("your-") || value.startsWith("https://<") || value.startsWith("replace-with");
}

function defaultValue(field: SettingField) {
  return field.defaultValue || "";
}

export async function getAppSettings() {
  const rows = await prisma.appSetting.findMany();
  const fromDb = new Map(rows.map((row) => [row.key, row.value]));

  return Object.fromEntries(
    APP_SETTING_FIELDS.map((field) => {
      const dbValue = fromDb.get(field.key);
      const envValue = field.envFallback ? process.env[field.key] : undefined;
      const value = dbValue || (!isPlaceholder(envValue) ? envValue : undefined) || defaultValue(field);
      return [field.key, value];
    })
  ) as Record<AppSettingKey, string>;
}

export async function getAppSetting(key: AppSettingKey) {
  return (await getAppSettings())[key];
}

export function publicSettingFields() {
  return APP_SETTING_FIELDS.map((field) => ({
    key: field.key,
    label: field.label,
    secret: field.secret,
    defaultValue: defaultValue(field)
  }));
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
}
