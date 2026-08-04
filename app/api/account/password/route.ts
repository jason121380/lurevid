import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { currentUser } from "@/lib/authz";
import { rateLimit } from "@/lib/rate-limit";
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from "@/lib/password-reset";

export const runtime = "nodejs";

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "請輸入目前的密碼"),
  newPassword: z
    .string()
    .min(MIN_PASSWORD_LENGTH, `新密碼至少 ${MIN_PASSWORD_LENGTH} 個字元`)
    .max(MAX_PASSWORD_LENGTH, "新密碼太長")
});

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "請先登入" }, { status: 401 });

  const limited = await rateLimit(`change-password:${user.id}`, 10, 3600);
  if (!limited.ok) return NextResponse.json({ error: "操作太頻繁，請稍後再試" }, { status: 429 });

  let body: z.infer<typeof changePasswordSchema>;
  try {
    body = changePasswordSchema.parse(await request.json());
  } catch (error) {
    const message = error instanceof z.ZodError ? error.issues[0]?.message : "資料格式錯誤";
    return NextResponse.json({ error: message || "資料格式錯誤" }, { status: 400 });
  }

  const record = await prisma.user.findUnique({ where: { id: user.id }, select: { passwordHash: true } });
  if (!record) return NextResponse.json({ error: "找不到帳號" }, { status: 404 });

  if (!(await bcrypt.compare(body.currentPassword, record.passwordHash))) {
    return NextResponse.json({ error: "目前的密碼不正確" }, { status: 400 });
  }
  if (body.currentPassword === body.newPassword) {
    return NextResponse.json({ error: "新密碼不能和目前的密碼相同" }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(body.newPassword, 12) }
  });
  // 主動改過密碼後，之前發出的重設連結就不該再有效。
  await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });

  return NextResponse.json({ ok: true, message: "密碼已更新" });
}
