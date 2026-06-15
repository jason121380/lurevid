import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { enqueueProjectJob } from "@/lib/queue";
import { loadOwnedProject, projectWithScenesInclude } from "@/lib/project-access";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

// 第 2 步「轉錄音訊」：重新下載影片並轉錄音訊。
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const owned = await loadOwnedProject(id);
  if (owned instanceof NextResponse) return owned;

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
