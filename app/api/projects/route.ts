import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { enqueueProjectJob } from "@/lib/queue";
import { detectPlatform, isSupportedSourceUrl } from "@/lib/transcribe";
import { currentUser } from "@/lib/authz";
import { MAX_TRANSCRIPT_LENGTH } from "@/lib/limits";

export const runtime = "nodejs";

const createProjectSchema = z.object({
  title: z.string().trim().min(1, "請輸入專案名稱").max(80, "專案名稱太長"),
  sourceUrl: z.string().url(),
  transcript: z.string().max(MAX_TRANSCRIPT_LENGTH, "逐字稿太長").optional(),
  settings: z
    .object({
      ratio: z.string().default("9:16"),
      resolution: z.string().default("720p"),
      duration: z.number().int().min(2).max(15).default(5)
    })
    .default({})
});

function toCreateProjectError(error: unknown) {
  if (error instanceof z.ZodError) {
    const first = error.issues[0];
    return {
      message: first?.path[0] === "title" ? first.message : "請貼上有效的 Instagram Reels 或 TikTok 連結",
      status: 400
    };
  }

  const message = error instanceof Error ? error.message : "";
  const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
  if (message.includes("Can't reach database server") || message.includes("localhost:5432")) {
    return {
      message: "本機 PostgreSQL 尚未啟動，請先啟動資料庫並確認 DATABASE_URL 可連線。",
      status: 503
    };
  }

  if (message.includes("Timed out fetching a new connection") || message.includes("connection pool")) {
    return {
      message: "資料庫連線池暫時滿了，請稍等幾秒再試；若持續發生，請重啟本機 dev server 或 worker。",
      status: 503
    };
  }

  if (code === "ECONNREFUSED" || message.includes("ECONNREFUSED") || message.includes("Redis")) {
    return {
      message: "Redis 尚未連線，請先設定 REDIS_URL 並啟動 worker queue 後再開始分析。",
      status: 503
    };
  }

  return { message: message || "建立專案失敗", status: 500 };
}

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "請先登入" }, { status: 401 });

  try {
    const body = createProjectSchema.parse(await request.json());
    if (!isSupportedSourceUrl(body.sourceUrl)) {
      return NextResponse.json({ error: "目前僅支援 Instagram Reels 與 TikTok 連結" }, { status: 400 });
    }

    const project = await prisma.project.create({
      data: {
        userId: user.id,
        title: body.title,
        sourceUrl: body.sourceUrl,
        sourcePlatform: detectPlatform(body.sourceUrl),
        sourceTranscript: body.transcript?.trim() || null,
        ratio: body.settings.ratio,
        resolution: body.settings.resolution,
        duration: body.settings.duration,
        status: "ANALYZING",
        message: "已建立專案，等待 worker 下載影片",
        progress: 0.03
      },
      include: { scenes: { orderBy: { sceneNumber: "asc" } } }
    });

    await enqueueProjectJob(project.id, "analyze");

    return NextResponse.json(project, { status: 202 });
  } catch (error) {
    const { message, status } = toCreateProjectError(error);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "請先登入" }, { status: 401 });

  const projects = await prisma.project.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      title: true,
      sourceUrl: true,
      sourcePlatform: true,
      status: true,
      progress: true,
      updatedAt: true,
      createdAt: true
    }
  });
  return NextResponse.json({ projects });
}
