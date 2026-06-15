import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email("請輸入有效的 Email"),
  password: z.string().min(8, "密碼至少 8 個字元").max(200, "密碼太長"),
  name: z.string().trim().max(80, "名稱太長").optional()
});

export async function POST(request: Request) {
  let body: z.infer<typeof registerSchema>;
  try {
    body = registerSchema.parse(await request.json());
  } catch (error) {
    const message = error instanceof z.ZodError ? error.issues[0]?.message : "註冊資料格式錯誤";
    return NextResponse.json({ error: message || "註冊資料格式錯誤" }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { email: body.email } });
  if (existing) {
    return NextResponse.json({ error: "這個 Email 已經註冊過了" }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(body.password, 12);
  await prisma.user.create({
    data: { email: body.email, name: body.name || null, passwordHash }
  });

  return NextResponse.json({ ok: true }, { status: 201 });
}
