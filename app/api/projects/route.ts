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

export async function POST(request: Request) {
  try {
    const body = createProjectSchema.parse(await request.json());
    if (!isSupportedSourceUrl(body.sourceUrl)) {
      return NextResponse.json({ error: "目前僅支援 Instagram Reels 與 TikTok 連結" }, { status: 400 });
    }

    const project = await prisma.project.create({
      data: {
        sourceUrl: body.sourceUrl,
        sourcePlatform: detectPlatform(body.sourceUrl),
        sourceTranscript: body.transcript?.trim() || null,
        ratio: body.settings.ratio,
        resolution: body.settings.resolution,
        duration: body.settings.duration,
        status: "ANALYZING",
        message: "正在取得影片內容並分析",
        progress: 0.05
      },
      include: { scenes: { orderBy: { sceneNumber: "asc" } } }
    });

    await enqueueProjectJob(project.id, "analyze");

    return NextResponse.json(project, { status: 202 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "建立專案失敗" }, { status: 500 });
  }
}

export async function GET() {
  const projects = await prisma.project.findMany({
    orderBy: { createdAt: "desc" },
    take: 20,
    include: { scenes: { orderBy: { sceneNumber: "asc" } } }
  });
  return NextResponse.json({ projects });
}
