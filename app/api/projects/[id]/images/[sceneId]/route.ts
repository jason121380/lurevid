import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; sceneId: string }> }) {
  const { id, sceneId } = await params;
  const scene = await prisma.scene.findFirst({
    where: { id: sceneId, projectId: id }
  });
  if (!scene?.imageLocalPath) return NextResponse.json({ error: "分鏡圖尚未完成" }, { status: 404 });

  const info = await stat(scene.imageLocalPath).catch(() => null);
  if (!info) return NextResponse.json({ error: "找不到分鏡圖檔案" }, { status: 404 });

  return new Response(createReadStream(scene.imageLocalPath) as any, {
    headers: {
      "Content-Type": "image/png",
      "Content-Length": String(info.size),
      "Cache-Control": "public, max-age=31536000, immutable"
    }
  });
}
