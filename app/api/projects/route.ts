import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { enqueueProjectJob } from "@/lib/queue";
import { detectPlatform, isSupportedSourceUrl } from "@/lib/transcribe";

export const runtime = "nodejs";

const createProjectSchema = z.object({
  sourceUrl: z.string().url(),
  transcript: z.string().optional(),
  settings: z
    .object({
      ratio: z.string().default("9:16"),
      resolution: z.string().default("720p"),
      duration: z.number().int().min(2).max(15).default(5)
    })
    .default({})
});

function projectTitle(sourceUrl: string) {
  const platform = detectPlatform(sourceUrl);
  const host = new URL(sourceUrl).hostname.replace(/^www\./, "");
  const time = new Date().toLocaleString("zh-TW", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
  return `${platform || host} 分析 ${time}`;
}

function toCreateProjectError(error: unknown) {
  if (error instanceof z.ZodError) return { message: "請貼上有效的 Instagram Reels 或 TikTok 連結", status: 400 };

  const message = error instanceof Error ? error.message : "";
  const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
  if (message.includes("Can't reach database server") || message.includes("localhost:5432")) {
    return {
      message: "本機 PostgreSQL 尚未啟動，請先啟動資料庫並確認 DATABASE_URL 可連線。",
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
  try {
    const body = createProjectSchema.parse(await request.json());
    if (!isSupportedSourceUrl(body.sourceUrl)) {
      return NextResponse.json({ error: "目前僅支援 Instagram Reels 與 TikTok 連結" }, { status: 400 });
    }

    const project = await prisma.project.create({
      data: {
        title: projectTitle(body.sourceUrl),
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
  const projects = await prisma.project.findMany({
    orderBy: { createdAt: "desc" },
    take: 20,
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
