import { createWriteStream } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { extname, join } from "node:path";
import { Readable } from "node:stream";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { pipeline } from "node:stream/promises";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { enqueueProjectJob } from "@/lib/queue";
import { currentUser } from "@/lib/authz";
import { rateLimit } from "@/lib/rate-limit";
import { DEFAULT_MAX_DOWNLOAD_BYTES } from "@/lib/safe-fetch";
import { storageRoot } from "@/lib/video";

export const runtime = "nodejs";

const ACCEPTED_VIDEO_TYPES = new Set(["video/mp4", "video/quicktime", "video/webm"]);

function extensionFor(file: File) {
  const nameExt = extname(file.name).toLowerCase();
  if ([".mp4", ".mov", ".webm", ".m4v"].includes(nameExt)) return nameExt;
  if (file.type === "video/quicktime") return ".mov";
  if (file.type === "video/webm") return ".webm";
  return ".mp4";
}

function isAcceptedVideo(file: File) {
  return ACCEPTED_VIDEO_TYPES.has(file.type) || /\.(mp4|mov|webm|m4v)$/i.test(file.name);
}

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "請先登入" }, { status: 401 });

  const limited = await rateLimit(`upload:${user.id}`, 10, 3600);
  if (!limited.ok) return NextResponse.json({ error: "上傳太頻繁，請稍後再試" }, { status: 429 });

  let uploadDir = "";
  let projectId = "";
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "請選擇影片檔案" }, { status: 400 });
    if (!isAcceptedVideo(file)) return NextResponse.json({ error: "目前只支援 MP4、MOV 或 WebM 影片" }, { status: 400 });
    if (file.size <= 0) return NextResponse.json({ error: "影片檔案是空的" }, { status: 400 });
    if (file.size > DEFAULT_MAX_DOWNLOAD_BYTES) return NextResponse.json({ error: "影片檔案太大，請上傳較小的影片" }, { status: 400 });

    const project = await prisma.project.create({
      data: {
        userId: user.id,
        title: file.name.replace(/\.[^.]+$/, "").slice(0, 80) || "上傳影片",
        sourcePlatform: "上傳影片",
        status: "ANALYZING",
        message: "已上傳影片，等待 worker 分析",
        progress: 0.03
      },
      include: { scenes: { orderBy: { sceneNumber: "asc" } } }
    });
    projectId = project.id;

    uploadDir = join(storageRoot(), "uploads", project.id);
    await mkdir(uploadDir, { recursive: true });
    const uploadPath = join(uploadDir, `source${extensionFor(file)}`);
    // 串流寫檔：影片可達數百 MB，整包讀進記憶體會拖垮 web 服務。
    await pipeline(
      Readable.fromWeb(file.stream() as unknown as NodeReadableStream<Uint8Array>),
      createWriteStream(uploadPath)
    );

    await enqueueProjectJob(project.id, "full", undefined, { uploadedVideoPath: uploadPath });

    return NextResponse.json(project, { status: 202 });
  } catch {
    if (uploadDir) await rm(uploadDir, { recursive: true, force: true });
    // 專案已建立卻沒排到任務時要標成失敗，否則會永遠卡在「分析中」而沒有 worker 接手。
    if (projectId) {
      await prisma.project
        .update({
          where: { id: projectId },
          data: { status: "FAILED", message: "任務失敗", error: "上傳影片失敗，請重新上傳影片再試一次。" }
        })
        .catch(() => undefined);
    }
    return NextResponse.json({ error: "上傳影片失敗，請稍後再試" }, { status: 500 });
  }
}
