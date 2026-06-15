import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { enqueueProjectJob } from "@/lib/queue";

export const runtime = "nodejs";

// 重新分析（含手動貼上逐字稿後重試）。
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) return NextResponse.json({ error: "找不到專案" }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const transcript = typeof body.transcript === "string" ? body.transcript.trim() : "";
  const retranscribe = body.retranscribe === true;

  await prisma.project.update({
    where: { id },
    data: {
      ...(retranscribe ? { sourceTranscript: null } : transcript ? { sourceTranscript: transcript } : {}),
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
