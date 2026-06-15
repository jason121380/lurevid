import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { enqueueProjectJob } from "@/lib/queue";
import { loadOwnedProject, projectWithScenesInclude } from "@/lib/project-access";
import { MAX_STRUCTURE_LENGTH } from "@/lib/limits";

export const runtime = "nodejs";

// 儲存（可編輯的）結構，並觸發「改編」。
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const owned = await loadOwnedProject(id);
  if (owned instanceof NextResponse) return owned;

  const body = await request.json().catch(() => ({}));
  const structure = typeof body.structure === "string" ? body.structure.trim().slice(0, MAX_STRUCTURE_LENGTH) : owned.project.structure;
  if (!structure) return NextResponse.json({ error: "尚未完成結構拆解" }, { status: 400 });

  await prisma.project.update({
    where: { id },
    data: { structure, status: "ADAPTING", message: "正在改編成新腳本", progress: 0.36, error: null }
  });

  await enqueueProjectJob(id, "adapt");

  const next = await prisma.project.findFirst({
    where: { id, userId: owned.user.id },
    include: projectWithScenesInclude
  });
  return NextResponse.json(next, { status: 202 });
}
