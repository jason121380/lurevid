import { NextResponse } from "next/server";
import { generateStoryboardWithTwoModels } from "@/lib/openai";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const idea = String(body.idea || "").trim();
    if (!idea) return NextResponse.json({ error: "請輸入想法" }, { status: 400 });

    const scenes = await generateStoryboardWithTwoModels(idea);
    return NextResponse.json({ scenes });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "分鏡失敗" }, { status: 500 });
  }
}
