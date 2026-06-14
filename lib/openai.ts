import OpenAI from "openai";
import { z } from "zod";
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

function client() {
  if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY.startsWith("replace-with")) {
    throw new Error("請先在 .env 設定有效的 OPENAI_API_KEY");
  }
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

function parseJsonText(text: string) {
  const trimmed = text.trim();
  const json = trimmed.startsWith("```") ? trimmed.replace(/^```json\s*/i, "").replace(/```$/i, "") : trimmed;
  return JSON.parse(json);
}

export async function createStoryboardBeats(idea: string): Promise<StoryboardBeat[]> {
  const openai = client();
  const model = process.env.OPENAI_STORY_MODEL || "gpt-5.4-mini";
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
  const openai = client();
  const model = process.env.OPENAI_PROMPT_MODEL || "gpt-5.4-mini";
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
  const openai = client();
  const model = process.env.OPENAI_IMAGE_MODEL || "gpt-image-1-mini";
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
