import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { enqueueProjectJob } from "@/lib/queue";

export const runtime = "nodejs";

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

  await enqueueProjectJob(id, "video", { attempts: 2, backoff: { type: "exponential", delay: 5000 } });

  const next = await prisma.project.findUnique({
    where: { id },
    include: { scenes: { orderBy: { sceneNumber: "asc" } } }
  });
  return NextResponse.json(next, { status: 202 });
}
