import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { enqueueProjectJob } from "@/lib/queue";
import { loadOwnedProject } from "@/lib/project-access";
import { MAX_TRANSCRIPT_LENGTH } from "@/lib/limits";

export const runtime = "nodejs";

// 重新分析影片，會重跑下載、轉錄、視覺分析與整合分析流程。
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const owned = await loadOwnedProject(id);
  if (owned instanceof NextResponse) return owned;

  const body = await request.json().catch(() => ({}));
  const transcript = typeof body.transcript === "string" ? body.transcript.trim().slice(0, MAX_TRANSCRIPT_LENGTH) : "";
  const retranscribe = body.retranscribe === true;

  await prisma.project.update({
    where: { id },
    data: {
      ...(retranscribe ? { sourceTranscript: null } : transcript ? { sourceTranscript: transcript } : {}),
      visualAnalysis: null,
      analysis: null,
      status: "ANALYZING",
      message: "正在分析",
      progress: 0.05,
      error: null
    }
  });

  await enqueueProjectJob(id, "analyze");

  const next = await prisma.project.findUnique({ where: { id }, include: { scenes: { orderBy: { sceneNumber: "asc" } } } });
  return NextResponse.json(next, { status: 202 });
}
