import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { enqueueProjectJob } from "@/lib/queue";
import { loadOwnedProject, projectWithScenesInclude } from "@/lib/project-access";
import { rateLimit } from "@/lib/rate-limit";
import { MAX_TRANSCRIPT_LENGTH } from "@/lib/limits";

export const runtime = "nodejs";

// 第 2 步「轉錄音訊」：可手動貼逐字稿（直接存，不下載），或重新下載+轉錄。
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const owned = await loadOwnedProject(id);
  if (owned instanceof NextResponse) return owned;

  const body = await request.json().catch(() => ({}));
  const manual = typeof body.transcript === "string" ? body.transcript.trim().slice(0, MAX_TRANSCRIPT_LENGTH) : "";

  if (manual) {
    const next = await prisma.project.update({
      where: { id },
      data: { sourceTranscript: manual, status: "DRAFT", message: "已更新逐字稿", error: null },
      include: { scenes: { orderBy: { sceneNumber: "asc" } } }
    });
    return NextResponse.json(next, { status: 200 });
  }

  if (!owned.project.sourceUrl) return NextResponse.json({ error: "缺少來源影片連結" }, { status: 400 });
  const limited = await rateLimit(`transcribe:${owned.user.id}`, 30, 3600);
  if (!limited.ok) return NextResponse.json({ error: "操作太頻繁，請稍後再試" }, { status: 429 });

  await prisma.project.update({ where: { id }, data: { status: "ANALYZING", message: "正在轉錄音訊", error: null } });
  await enqueueProjectJob(id, "transcribe");

  const next = await prisma.project.findFirst({
    where: { id, userId: owned.user.id },
    include: projectWithScenesInclude
  });
  return NextResponse.json(next, { status: 202 });
}
