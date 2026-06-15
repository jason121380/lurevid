import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { currentUser } from "@/lib/authz";

export const runtime = "nodejs";

const updateProjectSchema = z.object({
  title: z.string().trim().min(1, "專案名稱不能空白").max(80, "專案名稱太長").optional()
});

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "請先登入" }, { status: 401 });

  const project = await prisma.project.findUnique({
    where: { id },
    include: { scenes: { orderBy: { sceneNumber: "asc" } } }
  });

  if (!project || project.userId !== user.id) return NextResponse.json({ error: "找不到專案" }, { status: 404 });
  return NextResponse.json(project);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "請先登入" }, { status: 401 });

  const owned = await prisma.project.findUnique({ where: { id }, select: { userId: true } });
  if (!owned || owned.userId !== user.id) return NextResponse.json({ error: "找不到專案" }, { status: 404 });

  let body: z.infer<typeof updateProjectSchema>;
  try {
    body = updateProjectSchema.parse(await request.json());
  } catch (error) {
    const message = error instanceof z.ZodError ? error.issues[0]?.message : "資料格式錯誤";
    return NextResponse.json({ error: message || "資料格式錯誤" }, { status: 400 });
  }

  const project = await prisma.project.update({
    where: { id },
    data: body.title ? { title: body.title } : {},
    include: { scenes: { orderBy: { sceneNumber: "asc" } } }
  });

  return NextResponse.json(project);
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "請先登入" }, { status: 401 });

  const owned = await prisma.project.findUnique({ where: { id }, select: { userId: true } });
  if (!owned || owned.userId !== user.id) return NextResponse.json({ error: "找不到專案" }, { status: 404 });

  await prisma.project.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
