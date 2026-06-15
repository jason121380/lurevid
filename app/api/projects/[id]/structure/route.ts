import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { enqueueProjectJob } from "@/lib/queue";
import { loadOwnedProject } from "@/lib/project-access";
import { MAX_ANALYSIS_LENGTH } from "@/lib/limits";

export const runtime = "nodejs";

// 儲存（可編輯的）分析，並觸發「分析結構」。
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const owned = await loadOwnedProject(id);
  if (owned instanceof NextResponse) return owned;

  const body = await request.json().catch(() => ({}));
  const analysis = typeof body.analysis === "string" ? body.analysis.trim().slice(0, MAX_ANALYSIS_LENGTH) : owned.project.analysis;
  if (!analysis) return NextResponse.json({ error: "尚未完成分析" }, { status: 400 });

  await prisma.project.update({
    where: { id },
    data: { analysis, status: "STRUCTURING", message: "正在拆解影片結構", progress: 0.25, error: null }
  });

  await enqueueProjectJob(id, "structure");

  const next = await prisma.project.findUnique({ where: { id }, include: { scenes: { orderBy: { sceneNumber: "asc" } } } });
  return NextResponse.json(next, { status: 202 });
}
