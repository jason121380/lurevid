import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await prisma.project.findUnique({
    where: { id },
    include: { scenes: { orderBy: { sceneNumber: "asc" } } }
  });

  if (!project) return NextResponse.json({ error: "找不到專案" }, { status: 404 });
  return NextResponse.json(project);
}
