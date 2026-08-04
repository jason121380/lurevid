import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { currentUser } from "@/lib/authz";
import { rateLimit } from "@/lib/rate-limit";
import { enqueueGenerationJob } from "@/lib/queue";
import { MAX_PROMPT_LENGTH } from "@/lib/limits";

export const runtime = "nodejs";

const kindSchema = z.enum(["IMAGE", "VIDEO"]);

const createSchema = z.object({
  kind: kindSchema,
  prompt: z.string().trim().min(1, "請先輸入提示詞").max(MAX_PROMPT_LENGTH, "提示詞太長"),
  ratio: z.enum(["9:16", "1:1", "16:9"]).default("9:16"),
  duration: z.union([z.literal(8), z.literal(15)]).default(8)
});

export async function GET(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "請先登入" }, { status: 401 });

  const kindParam = new URL(request.url).searchParams.get("kind");
  const kind = kindSchema.safeParse(kindParam);
  if (!kind.success) return NextResponse.json({ error: "類型不正確" }, { status: 400 });

  const generations = await prisma.generation.findMany({
    where: { userId: user.id, kind: kind.data },
    orderBy: { createdAt: "desc" },
    take: 60
  });
  return NextResponse.json({ generations });
}

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "請先登入" }, { status: 401 });

  let body: z.infer<typeof createSchema>;
  try {
    body = createSchema.parse(await request.json());
  } catch (error) {
    const message = error instanceof z.ZodError ? error.issues[0]?.message : "資料格式錯誤";
    return NextResponse.json({ error: message || "資料格式錯誤" }, { status: 400 });
  }

  // 圖片便宜、影片貴，額度分開算。
  const limited = await rateLimit(
    `quick:${body.kind.toLowerCase()}:${user.id}`,
    body.kind === "IMAGE" ? 60 : 20,
    3600
  );
  if (!limited.ok) {
    return NextResponse.json({ error: "產生太頻繁，請稍後再試" }, { status: 429 });
  }

  const generation = await prisma.generation.create({
    data: {
      userId: user.id,
      kind: body.kind,
      prompt: body.prompt,
      ratio: body.ratio,
      duration: body.kind === "VIDEO" ? body.duration : 0,
      status: "QUEUED"
    }
  });

  try {
    await enqueueGenerationJob(generation.id);
  } catch {
    // 排不進佇列就當場標失敗，不要留一張永遠轉圈的卡片。
    const failed = await prisma.generation.update({
      where: { id: generation.id },
      data: { status: "FAILED", error: "目前無法排入生成佇列，請稍後再試。" }
    });
    return NextResponse.json({ generation: failed }, { status: 202 });
  }

  return NextResponse.json({ generation }, { status: 202 });
}
