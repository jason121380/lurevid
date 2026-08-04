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
const GENERIC_OK = { ok: true, message: "如果這個 Email 有註冊過，我們已經寄出重設密碼的信，請收信（含垃圾郵件匣）。" };

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

  try {
    const user = await prisma.user.findUnique({ where: { email: body.email }, select: { id: true, email: true } });
    if (user) {
      const { token } = await issueResetToken(user.id);
      await sendMail(passwordResetMail(user.email, resetUrlFor(token), RESET_TOKEN_TTL_MINUTES));
    }
  } catch (error) {
    // 寄信只會發生在「帳號存在」的分支，所以這裡不能回不一樣的結果，
    // 否則錯誤訊息本身就變成帳號存在與否的探測管道。失敗只記在伺服器日誌。
    console.error("[forgot-password] 寄送重設信失敗", error);
  }

  return NextResponse.json(GENERIC_OK);
}
