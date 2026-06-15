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

  try {
    const existing = await prisma.user.findUnique({ where: { email: body.email } });
    if (existing) {
      return NextResponse.json({ error: "這個 Email 已經註冊過了" }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(body.password, 12);
    await prisma.user.create({
      data: { email: body.email, name: body.name || null, passwordHash }
    });

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
    // P2021: 資料表不存在；P1001/P1000: 連不到資料庫。
    if (code === "P2021" || message.includes("does not exist") || message.includes("relation")) {
      return NextResponse.json(
        { error: "資料庫尚未初始化，請先執行 npm run db:push 建立資料表。" },
        { status: 503 }
      );
    }
    if (code === "P1001" || code === "P1000" || message.includes("Can't reach database server")) {
      return NextResponse.json({ error: "目前連不到資料庫，請稍後再試。" }, { status: 503 });
    }
    return NextResponse.json({ error: "註冊失敗，請稍後再試。" }, { status: 500 });
  }
}
