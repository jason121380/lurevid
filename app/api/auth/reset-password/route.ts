import { NextResponse } from "next/server";
import { z } from "zod";
import { rateLimit } from "@/lib/rate-limit";
import {
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  consumeResetToken,
  findUsableResetToken
} from "@/lib/password-reset";

export const runtime = "nodejs";

const resetPasswordSchema = z.object({
  token: z.string().trim().min(1),
  password: z
    .string()
    .min(MIN_PASSWORD_LENGTH, `密碼至少 ${MIN_PASSWORD_LENGTH} 個字元`)
    .max(MAX_PASSWORD_LENGTH, "密碼太長")
});

function clientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || "unknown";
}

const INVALID_TOKEN = "這個重設連結已失效或已使用過，請重新申請一次。";

/** GET：開啟頁面時先確認連結還有效，才顯示表單。 */
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token") || "";
  const limited = await rateLimit(`reset-check:ip:${clientIp(request)}`, 60, 3600);
  if (!limited.ok) return NextResponse.json({ error: "請求太頻繁，請稍後再試。" }, { status: 429 });

  const record = await findUsableResetToken(token);
  if (!record) return NextResponse.json({ valid: false, error: INVALID_TOKEN }, { status: 400 });
  return NextResponse.json({ valid: true });
}

export async function POST(request: Request) {
  const limited = await rateLimit(`reset:ip:${clientIp(request)}`, 20, 3600);
  if (!limited.ok) return NextResponse.json({ error: "請求太頻繁，請稍後再試。" }, { status: 429 });

  let body: z.infer<typeof resetPasswordSchema>;
  try {
    body = resetPasswordSchema.parse(await request.json());
  } catch (error) {
    const message = error instanceof z.ZodError ? error.issues[0]?.message : "資料格式錯誤";
    return NextResponse.json({ error: message || "資料格式錯誤" }, { status: 400 });
  }

  const record = await findUsableResetToken(body.token);
  if (!record) return NextResponse.json({ error: INVALID_TOKEN }, { status: 400 });

  const done = await consumeResetToken(record.id, record.userId, body.password);
  if (!done) return NextResponse.json({ error: INVALID_TOKEN }, { status: 400 });

  return NextResponse.json({ ok: true, message: "密碼已更新，請用新密碼登入。" });
}
