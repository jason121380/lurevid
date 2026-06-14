import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { storageRoot } from "@/lib/video";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project?.finalVideoUrl) return NextResponse.json({ error: "影片尚未完成" }, { status: 404 });

  const path = join(storageRoot(), id, "final.mp4");
  const info = await stat(path).catch(() => null);
  if (!info) return NextResponse.json({ error: "找不到影片檔案" }, { status: 404 });

  const stream = createReadStream(path);
  return new Response(stream as any, {
    headers: {
      "Content-Type": "video/mp4",
      "Content-Length": String(info.size),
      "Cache-Control": "public, max-age=31536000, immutable"
    }
  });
}
