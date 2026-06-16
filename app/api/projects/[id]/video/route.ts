import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { enqueueProjectJob } from "@/lib/queue";
import { currentUser } from "@/lib/authz";
import { projectWithScenesInclude } from "@/lib/project-access";
import { parseVideoSettings } from "@/lib/project-schemas";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const VIDEO_BUSY_STATUSES = ["QUEUED", "GENERATING", "MERGING"];

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "請先登入" }, { status: 401 });

  const limited = await rateLimit(`video:${user.id}`, 20, 3600);
  if (!limited.ok) return NextResponse.json({ error: "操作太頻繁，請稍後再試" }, { status: 429 });

  const project = await prisma.project.findFirst({
    where: { id, userId: user.id },
    include: { scenes: true }
  });

  if (!project) return NextResponse.json({ error: "找不到專案" }, { status: 404 });
  if (VIDEO_BUSY_STATUSES.includes(project.status)) {
    return NextResponse.json({ error: "影片正在生成中，請稍後再試" }, { status: 409 });
  }
  if (project.scenes.length !== 9 || project.scenes.some((scene) => !scene.imageUrl)) {
    return NextResponse.json({ error: "需要 9 張分鏡圖才能變成影片" }, { status: 400 });
  }
  if (!project.storyboardImageUrl) {
    return NextResponse.json({ error: "請先完成第 7 步合併分鏡" }, { status: 400 });
  }

  let settings: { ratio: "9:16"; resolution: "720p"; duration: 8 | 15 };
  try {
    settings = parseVideoSettings(await request.json().catch(() => ({})), {
      ratio: "9:16",
      resolution: "720p",
      duration: project.duration === 15 ? 15 : 8
    });
  } catch {
    return NextResponse.json({ error: "影片設定格式錯誤" }, { status: 400 });
  }

  await prisma.project.update({
    where: { id },
    data: { ...settings, status: "QUEUED", message: "已排入影片生成佇列，等待 worker 接手", progress: 0.62 }
  });

  await enqueueProjectJob(id, "video", { attempts: 1 });

  const next = await prisma.project.findFirst({
    where: { id, userId: user.id },
    include: projectWithScenesInclude
  });
  return NextResponse.json(next, { status: 202 });
}
