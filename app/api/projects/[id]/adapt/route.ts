import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { enqueueProjectJob } from "@/lib/queue";
import { loadOwnedProject, projectWithScenesInclude } from "@/lib/project-access";
import { MAX_ANALYSIS_LENGTH, MAX_STRUCTURE_LENGTH } from "@/lib/limits";

export const runtime = "nodejs";

// 儲存可用的分析/結構，並觸發「改編」。若還沒有結構，worker 會先做內部結構拆解。
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const owned = await loadOwnedProject(id);
  if (owned instanceof NextResponse) return owned;

  const body = await request.json().catch(() => ({}));
  const analysis = typeof body.analysis === "string" ? body.analysis.trim().slice(0, MAX_ANALYSIS_LENGTH) : owned.project.analysis;
  const structure = typeof body.structure === "string" ? body.structure.trim().slice(0, MAX_STRUCTURE_LENGTH) : owned.project.structure;
  if (!analysis) return NextResponse.json({ error: "尚未完成影片分析" }, { status: 400 });

  await prisma.project.update({
    where: { id },
    data: { analysis, structure: structure || null, status: "ADAPTING", message: "正在改編成新腳本", progress: 0.36, error: null }
  });

  await enqueueProjectJob(id, "adapt");

  const next = await prisma.project.findFirst({
    where: { id, userId: owned.user.id },
    include: projectWithScenesInclude
  });
  return NextResponse.json(next, { status: 202 });
}
