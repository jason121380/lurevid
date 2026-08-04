import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/authz";
import { rateLimit } from "@/lib/rate-limit";
import { enhancePrompt } from "@/lib/openai";
import { MAX_PROMPT_LENGTH } from "@/lib/limits";

export const runtime = "nodejs";

const enhanceSchema = z.object({
  kind: z.enum(["IMAGE", "VIDEO"]),
  prompt: z.string().trim().min(1, "請先輸入提示詞").max(MAX_PROMPT_LENGTH, "提示詞太長")
});

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "請先登入" }, { status: 401 });

  const limited = await rateLimit(`quick:enhance:${user.id}`, 120, 3600);
  if (!limited.ok) return NextResponse.json({ error: "補完太頻繁，請稍後再試" }, { status: 429 });

  let body: z.infer<typeof enhanceSchema>;
  try {
    body = enhanceSchema.parse(await request.json());
  } catch (error) {
    const message = error instanceof z.ZodError ? error.issues[0]?.message : "資料格式錯誤";
    return NextResponse.json({ error: message || "資料格式錯誤" }, { status: 400 });
  }

  try {
    return NextResponse.json({ prompt: await enhancePrompt(body.prompt, body.kind) });
  } catch (error) {
    console.error("[quick/enhance]", error);
    const message =
      error instanceof Error && error.message.startsWith("請先在設定頁")
        ? error.message
        : "提示詞補完失敗，請稍後再試";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
