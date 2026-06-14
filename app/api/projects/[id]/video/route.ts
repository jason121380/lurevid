import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createProjectQueue } from "@/lib/queue";
import { storageRoot } from "@/lib/video";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project?.finalVideoUrl) return NextResponse.json({ error: "影片尚未完成" }, { status: 404 });

  const path = join(storageRoot(), id, "final.mp4");
  const info = await stat(path).catch(() => null);
  if (!info) return NextResponse.json({ error: "找不到影片檔案" }, { status: 404 });

  return new Response(createReadStream(path) as any, {
    headers: {
      "Content-Type": "video/mp4",
      "Content-Length": String(info.size),
      "Cache-Control": "public, max-age=31536000, immutable"
    }
  });
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await prisma.project.findUnique({
    where: { id },
    include: { scenes: true }
  });

  if (!project) return NextResponse.json({ error: "找不到專案" }, { status: 404 });
  if (project.status !== "STORYBOARD_READY") {
    return NextResponse.json({ error: "分鏡圖尚未完成，不能開始生成影片" }, { status: 400 });
  }
  if (project.scenes.length !== 9 || project.scenes.some((scene) => !scene.imageUrl)) {
    return NextResponse.json({ error: "需要 9 張分鏡圖才能變成影片" }, { status: 400 });
  }

  await prisma.project.update({
    where: { id },
    data: { status: "QUEUED", message: "已排入影片生成佇列", progress: 0.5 }
  });

  const queue = createProjectQueue();
  await queue.add("generate-video", { projectId: id, action: "video" }, { attempts: 2, backoff: { type: "exponential", delay: 5000 } });
  await queue.close();

  const next = await prisma.project.findUnique({
    where: { id },
    include: { scenes: { orderBy: { sceneNumber: "asc" } } }
  });
  return NextResponse.json(next, { status: 202 });
}
