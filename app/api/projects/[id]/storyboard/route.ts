import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { enqueueProjectJob } from "@/lib/queue";
import { loadOwnedProject, projectWithScenesInclude } from "@/lib/project-access";
import { MAX_SCRIPT_LENGTH } from "@/lib/limits";

export const runtime = "nodejs";

// 儲存（可編輯的）改編腳本，並觸發產生分鏡圖。
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const owned = await loadOwnedProject(id);
  if (owned instanceof NextResponse) return owned;

  const body = await request.json().catch(() => ({}));
  const adaptedScript = typeof body.adaptedScript === "string" ? body.adaptedScript.trim().slice(0, MAX_SCRIPT_LENGTH) : owned.project.adaptedScript;
  if (!adaptedScript) return NextResponse.json({ error: "尚未完成改編腳本" }, { status: 400 });

  await prisma.project.update({
    where: { id },
    data: {
      adaptedScript,
      idea: adaptedScript,
      status: "STORYBOARDING",
      message: "正在產生分鏡圖",
      progress: 0.45,
      error: null
    }
  });

  await enqueueProjectJob(id, "storyboard");

  const next = await prisma.project.findFirst({
    where: { id, userId: owned.user.id },
    include: projectWithScenesInclude
  });
  return NextResponse.json(next, { status: 202 });
}
