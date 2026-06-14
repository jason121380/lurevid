import OpenAI from "openai";
import { z } from "zod";
import { getAppSettings } from "@/lib/settings";
import type { StoryboardBeat, StoryboardScene } from "@/lib/types";

const storyboardSchema = z.object({
  scenes: z
    .array(
      z.object({
        sceneNumber: z.number().int().min(1).max(9),
        title: z.string().min(1),
        visualGoal: z.string().min(1),
        imagePrompt: z.string().min(20),
        seedancePrompt: z.string().min(20)
      })
    )
    .length(9)
});

function isMissingApiKey(value: string) {
  return !value || value === "sk-..." || value.startsWith("replace-with");
}

function openaiTimeoutMs() {
  return Number(process.env.OPENAI_TIMEOUT_MS || 120000);
}

function openaiImageTimeoutMs() {
  return Number(process.env.OPENAI_IMAGE_TIMEOUT_MS || 300000);
}

async function client(timeout = openaiTimeoutMs(), maxRetries = 1) {
  const settings = await getAppSettings();
  if (isMissingApiKey(settings.OPENAI_API_KEY)) {
    throw new Error("請先在設定頁填入有效的 OPENAI_API_KEY");
  }
  return new OpenAI({ apiKey: settings.OPENAI_API_KEY, timeout, maxRetries });
}

export async function openaiClient() {
  return client();
}

async function generateText(model: string, system: string, user: string) {
  const openai = await client();
  const response = await openai.responses.create({
    model,
    input: [
      { role: "system", content: system },
      { role: "user", content: user }
    ]
  });
  return response.output_text.trim();
}

const textModel = async () => (await getAppSettings()).OPENAI_STORY_MODEL || "gpt-5.4-mini";

/** 第 1 步：分析這支短影音。 */
export async function analyzeVideo(transcript: string, platform: string, visualAnalysis?: string) {
  return generateText(
    await textModel(),
    "你是短影音內容策略分析師。根據逐字稿與視覺分鏡分析這支短影音，用繁體中文、條列重點，精簡有洞察。",
    `平台：${platform}\n逐字稿：\n${transcript}\n\n視覺分鏡分析：\n${visualAnalysis || "未取得"}\n\n請整合分析：主題、目標受眾、核心賣點、語氣與風格、畫面與字幕如何輔助說服、分鏡/剪輯節奏，以及它為什麼會吸引人。`
  );
}

export async function summarizeProjectTitle(analysis: string) {
  const title = await generateText(
    await textModel(),
    "你是短影音專案命名助手。請根據分析內容產生一個精準、好辨識的繁體中文短標題，只輸出標題本身，不要引號、不要標點裝飾。",
    `分析內容：\n${analysis}\n\n請輸出 8 到 16 個中文字以內的專案名稱，聚焦影片主題或核心洞察。`
  );

  return title
    .replace(/^["「『]|["」』]$/g, "")
    .replace(/[\n\r]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40);
}

/** 第 2 步：拆解敘事結構。 */
export async function analyzeStructure(transcript: string, analysis: string) {
  return generateText(
    await textModel(),
    "你是爆款短影音結構拆解專家。用繁體中文條列影片的敘事結構與節奏。",
    `先前分析：\n${analysis}\n\n逐字稿：\n${transcript}\n\n請拆解：開頭 hook、鋪陳、賣點呈現、CTA／結尾，每段大約時間佔比與使用的手法。`
  );
}

/** 第 3 步：改編成全新原創腳本構想（接給分鏡使用）。 */
export async function adaptScript(analysis: string, structure: string) {
  return generateText(
    (await getAppSettings()).OPENAI_PROMPT_MODEL || (await textModel()),
    "你是短影音編劇。根據結構分析，改編出一支全新、原創、不抄襲的短影音腳本構想，用繁體中文。",
    `分析：\n${analysis}\n\n結構：\n${structure}\n\n請輸出一份可直接拿去做分鏡的腳本構想：一段完整描述，包含主題、調性、畫面走向與節奏。`
  );
}

function parseJsonText(text: string) {
  const trimmed = text.trim();
  const json = trimmed.startsWith("```") ? trimmed.replace(/^```json\s*/i, "").replace(/```$/i, "") : trimmed;
  return JSON.parse(json);
}

export async function createStoryboardBeats(idea: string): Promise<StoryboardBeat[]> {
  const openai = await client();
  const model = (await getAppSettings()).OPENAI_STORY_MODEL || "gpt-5.4-mini";
  const response = await openai.responses.create({
    model,
    input: [
      {
        role: "system",
        content:
          "你是商業影片導演。請把使用者想法拆成正好 9 個連續鏡頭。輸出只能是 JSON，不要 markdown。"
      },
      {
        role: "user",
        content: `想法：${idea}\n\n請輸出 {"scenes":[{"sceneNumber":1,"title":"","visualGoal":""}]}，正好 9 筆。`
      }
    ],
    text: {
      format: {
        type: "json_schema",
        name: "storyboard_beats",
        schema: {
          type: "object",
          additionalProperties: false,
          required: ["scenes"],
          properties: {
            scenes: {
              type: "array",
              minItems: 9,
              maxItems: 9,
              items: {
                type: "object",
                additionalProperties: false,
                required: ["sceneNumber", "title", "visualGoal"],
                properties: {
                  sceneNumber: { type: "number" },
                  title: { type: "string" },
                  visualGoal: { type: "string" }
                }
              }
            }
          }
        },
        strict: true
      }
    }
  });

  const parsed = parseJsonText(response.output_text);
  return z
    .object({
      scenes: z
        .array(
          z.object({
            sceneNumber: z.number(),
            title: z.string(),
            visualGoal: z.string()
          })
        )
        .length(9)
    })
    .parse(parsed).scenes;
}

export async function expandSeedancePrompts(
  idea: string,
  beats: StoryboardBeat[]
): Promise<StoryboardScene[]> {
  const openai = await client();
  const model = (await getAppSettings()).OPENAI_PROMPT_MODEL || "gpt-5.4-mini";
  const response = await openai.responses.create({
    model,
    input: [
      {
        role: "system",
        content:
          "你是 AI 影像與 Seedance 2.0 prompt engineer。把每個分鏡改寫成英文 image prompt 與英文影片生成 prompt，必須連續一致、可商業使用、無字幕、無畫面文字。輸出只能是 JSON。"
      },
      {
        role: "user",
        content: JSON.stringify({
          idea,
          rules: [
            "正好 9 個 scenes",
            "保留 sceneNumber/title/visualGoal",
            "imagePrompt 用英文，產生單張分鏡圖，包含構圖、主體、場景、光線、風格、連續性",
            "seedancePrompt 用英文，基於該分鏡圖延展成影片，包含動作、鏡頭運動、光線、節奏、避免文字"
          ],
          scenes: beats
        })
      }
    ],
    text: {
      format: {
        type: "json_schema",
        name: "seedance_prompts",
        schema: {
          type: "object",
          additionalProperties: false,
          required: ["scenes"],
          properties: {
            scenes: {
              type: "array",
              minItems: 9,
              maxItems: 9,
              items: {
                type: "object",
                additionalProperties: false,
                required: ["sceneNumber", "title", "visualGoal", "imagePrompt", "seedancePrompt"],
                properties: {
                  sceneNumber: { type: "number" },
                  title: { type: "string" },
                  visualGoal: { type: "string" },
                  imagePrompt: { type: "string" },
                  seedancePrompt: { type: "string" }
                }
              }
            }
          }
        },
        strict: true
      }
    }
  });

  return storyboardSchema.parse(parseJsonText(response.output_text)).scenes;
}

export async function generateStoryboardWithTwoModels(idea: string) {
  const beats = await createStoryboardBeats(idea);
  return expandSeedancePrompts(idea, beats);
}

export async function generateStoryboardImage(prompt: string, ratio: string) {
  const openai = await client(openaiImageTimeoutMs(), 2);
  const model = (await getAppSettings()).OPENAI_IMAGE_MODEL || "gpt-image-2";
  const size = ratio === "9:16" ? "1024x1536" : ratio === "1:1" ? "1024x1024" : "1536x1024";
  const response = await openai.images.generate({
    model,
    prompt,
    size,
    n: 1
  } as any);
  const image = response.data?.[0] as { b64_json?: string; url?: string } | undefined;
  if (!image?.b64_json && !image?.url) throw new Error("OpenAI 沒有回傳分鏡圖");
  return image;
}
