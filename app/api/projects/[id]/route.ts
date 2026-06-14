import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const updateProjectSchema = z.object({
  title: z.string().trim().min(1, "專案名稱不能空白").max(80, "專案名稱太長").optional()
});

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await prisma.project.findUnique({
    where: { id },
    include: { scenes: { orderBy: { sceneNumber: "asc" } } }
  });

  if (!project) return NextResponse.json({ error: "找不到專案" }, { status: 404 });
  return NextResponse.json(project);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = updateProjectSchema.parse(await request.json());

  const project = await prisma.project.update({
    where: { id },
    data: body.title ? { title: body.title } : {},
    include: { scenes: { orderBy: { sceneNumber: "asc" } } }
  });

  return NextResponse.json(project);
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  await prisma.project.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
