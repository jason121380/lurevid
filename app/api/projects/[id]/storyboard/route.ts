import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { enqueueProjectJob } from "@/lib/queue";

export const runtime = "nodejs";

// 儲存（可編輯的）改編腳本，並觸發產生分鏡圖。
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) return NextResponse.json({ error: "找不到專案" }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const adaptedScript = typeof body.adaptedScript === "string" ? body.adaptedScript.trim() : project.adaptedScript;
  if (!adaptedScript) return NextResponse.json({ error: "尚未完成改編腳本" }, { status: 400 });

  await prisma.project.update({
    where: { id },
    data: {
      adaptedScript,
      idea: adaptedScript,
      status: "STORYBOARDING",
      message: "正在產生分鏡圖",
      progress: 0.45,
      error: null
    }
  });

  await enqueueProjectJob(id, "storyboard");

  const next = await prisma.project.findUnique({ where: { id }, include: { scenes: { orderBy: { sceneNumber: "asc" } } } });
  return NextResponse.json(next, { status: 202 });
}
