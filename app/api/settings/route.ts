import { NextResponse } from "next/server";
import { z } from "zod";
import {
  APP_SETTING_FIELDS,
  type AppSettingKey,
  getAppSettings,
  maskSecret,
  publicSettingFields,
  saveAppSettings
} from "@/lib/settings";
import { requireAdmin, isResponse } from "@/lib/authz";

export const runtime = "nodejs";

const settingsSchema = z.object({
  values: z.record(z.string(), z.string())
});

export async function GET() {
  const admin = await requireAdmin();
  if (isResponse(admin)) return admin;

  const values = await getAppSettings();
  const fields = publicSettingFields().map((field) => {
    const value = values[field.key] || "";
    return {
      ...field,
      value: field.secret ? "" : value,
      configured: Boolean(value),
      maskedValue: field.secret ? maskSecret(value) : ""
    };
  });

  return NextResponse.json({ fields });
}

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (isResponse(admin)) return admin;

  const body = settingsSchema.parse(await request.json());
  const knownKeys = new Set<AppSettingKey>(APP_SETTING_FIELDS.map((field) => field.key));
  const secretKeys = new Set<AppSettingKey>(APP_SETTING_FIELDS.filter((field) => field.secret).map((field) => field.key));
  const values: Partial<Record<AppSettingKey, string>> = {};

  for (const [key, value] of Object.entries(body.values)) {
    if (!knownKeys.has(key as AppSettingKey)) continue;
    const settingKey = key as AppSettingKey;
    if (secretKeys.has(settingKey) && value.trim() === "") continue;
    values[settingKey] = value;
  }

  await saveAppSettings(values);

  return NextResponse.json({ ok: true });
}
