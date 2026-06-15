import { NextResponse } from "next/server";
import { z } from "zod";
import { APP_SETTING_FIELDS, getAppSettings, publicSettingFields, saveAppSettings } from "@/lib/settings";
import { requireAdmin, isResponse } from "@/lib/authz";

export const runtime = "nodejs";

const settingsSchema = z.object({
  values: z.record(z.string(), z.string())
});

function maskSecret(value: string) {
  if (!value) return "";
  if (value.length <= 8) return "••••••••";
  return `${value.slice(0, 4)}••••${value.slice(-4)}`;
}

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
  const secretKeys = new Set(APP_SETTING_FIELDS.filter((field) => field.secret).map((field) => field.key));

  await saveAppSettings(
    Object.fromEntries(
      Object.entries(body.values).filter(([key, value]) => {
        if (!secretKeys.has(key as any)) return true;
        return value.trim() !== "";
      })
    ) as any
  );

  return NextResponse.json({ ok: true });
}
