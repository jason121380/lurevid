import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { enqueueProjectJob } from "@/lib/queue";
import { loadOwnedProject, projectWithScenesInclude } from "@/lib/project-access";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

// 第 4 步「影片分析」：用已存的逐字稿＋影格重新分析，不重新下載影片。
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const owned = await loadOwnedProject(id);
  if (owned instanceof NextResponse) return owned;
  if (!owned.project.sourceTranscript) {
    return NextResponse.json({ error: "尚未取得逐字稿，請先完成轉錄" }, { status: 400 });
  }
  if (!Array.isArray(owned.project.sourceFrameUrls) || owned.project.sourceFrameUrls.length === 0) {
    return NextResponse.json({ error: "尚未取得影格，請先完成抽取影格" }, { status: 400 });
  }

  const limited = await rateLimit(`analyze:${owned.user.id}`, 60, 3600);
  if (!limited.ok) return NextResponse.json({ error: "操作太頻繁，請稍後再試" }, { status: 429 });

  await prisma.project.update({
    where: { id },
    data: { analysis: null, status: "ANALYZING", message: "正在做影片分析", error: null }
  });
  await enqueueProjectJob(id, "analyze");

  const next = await prisma.project.findFirst({
    where: { id, userId: owned.user.id },
    include: projectWithScenesInclude
  });
  return NextResponse.json(next, { status: 202 });
}
