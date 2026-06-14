import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { enqueueProjectJob } from "@/lib/queue";

export const runtime = "nodejs";

// 儲存（可編輯的）結構，並觸發「改編」。
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) return NextResponse.json({ error: "找不到專案" }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const structure = typeof body.structure === "string" ? body.structure.trim() : project.structure;
  if (!structure) return NextResponse.json({ error: "尚未完成結構拆解" }, { status: 400 });

  await prisma.project.update({
    where: { id },
    data: { structure, status: "ADAPTING", message: "正在改編成新腳本", progress: 0.36, error: null }
  });

  await enqueueProjectJob(id, "adapt");

  const next = await prisma.project.findUnique({ where: { id }, include: { scenes: { orderBy: { sceneNumber: "asc" } } } });
  return NextResponse.json(next, { status: 202 });
}
