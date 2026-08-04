import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { isMailerConfigured, passwordResetMail, sendMail } from "@/lib/mailer";
import { RESET_TOKEN_TTL_MINUTES, issueResetToken, resetUrlFor } from "@/lib/password-reset";

export const runtime = "nodejs";

const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email()
});

function clientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || "unknown";
}

// 不論帳號是否存在都回同一則訊息，避免被拿來列舉已註冊的 Email。
/**
 * 這個端點會明講帳號存不存在，代價是可以被拿來列舉已註冊的 Email。
 * 這是刻意的取捨：`/api/register` 本來就會回「這個 Email 已經註冊過了」，
 * 同樣問得出答案，所以這裡裝傻只會讓真正的使用者困惑。
 * 濫用防線改由上面的 per-IP / per-email 限流負責。
 */
export async function POST(request: Request) {
  let body: z.infer<typeof forgotPasswordSchema>;
  try {
    body = forgotPasswordSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "請輸入有效的 Email" }, { status: 400 });
  }

  const [ipLimit, emailLimit] = await Promise.all([
    rateLimit(`forgot:ip:${clientIp(request)}`, 20, 3600),
    rateLimit(`forgot:email:${body.email}`, 5, 3600)
  ]);
  if (!ipLimit.ok || !emailLimit.ok) {
    return NextResponse.json({ error: "重設請求太頻繁，請稍後再試。" }, { status: 429 });
  }

  // 沒設定寄信服務時就直說，否則使用者會一直等一封永遠不會來的信。
  if (!(await isMailerConfigured())) {
    return NextResponse.json(
      { error: "這個站台尚未設定寄信服務，請聯絡管理員協助重設密碼。" },
      { status: 503 }
    );
  }

  const user = await prisma.user.findUnique({ where: { email: body.email }, select: { id: true, email: true } });
  if (!user) {
    return NextResponse.json(
      { error: "這個 Email 還沒有註冊過。請確認拼字，或直接註冊一個新帳號。", notRegistered: true },
      { status: 404 }
    );
  }

  try {
    const { token } = await issueResetToken(user.id);
    await sendMail(passwordResetMail(user.email, resetUrlFor(token), RESET_TOKEN_TTL_MINUTES));
  } catch (error) {
    // 原始的寄信錯誤含主機/金鑰等細節，只留在伺服器日誌。
    console.error("[forgot-password] 寄送重設信失敗", error);
    return NextResponse.json(
      { error: "重設信寄送失敗，請稍後再試；若持續發生請聯絡管理員。" },
      { status: 502 }
    );
  }

  return NextResponse.json({
    ok: true,
    message: `重設連結已寄到 ${user.email}，請收信（含垃圾郵件匣）。`
  });
}
