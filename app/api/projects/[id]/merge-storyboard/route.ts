import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { enqueueProjectJob } from "@/lib/queue";
import { loadOwnedProjectWithScenes, projectWithScenesInclude } from "@/lib/project-access";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const MERGE_BUSY_STATUSES = ["STORYBOARDING", "QUEUED", "GENERATING", "MERGING"];

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const owned = await loadOwnedProjectWithScenes(id);
  if (owned instanceof NextResponse) return owned;

  const limited = await rateLimit(`merge-storyboard:${owned.user.id}`, 20, 3600);
  if (!limited.ok) return NextResponse.json({ error: "操作太頻繁，請稍後再試" }, { status: 429 });

  const { project } = owned;
  if (MERGE_BUSY_STATUSES.includes(project.status)) {
    return NextResponse.json({ error: "目前有任務執行中，請稍後再試" }, { status: 409 });
  }
  if (project.scenes.length !== 9 || project.scenes.some((scene) => !scene.imageUrl)) {
    return NextResponse.json({ error: "需要 9 張分鏡圖才能合併分鏡" }, { status: 400 });
  }

  await prisma.project.update({
    where: { id },
    data: {
      storyboardImageUrl: null,
      finalVideoUrl: null,
      status: "STORYBOARDING",
      message: "已排入合併分鏡佇列，等待 worker 接手",
      progress: 0.52,
      error: null
    }
  });

  await enqueueProjectJob(id, "mergeStoryboard");

  const next = await prisma.project.findFirst({
    where: { id, userId: owned.user.id },
    include: projectWithScenesInclude
  });
  return NextResponse.json(next, { status: 202 });
}
