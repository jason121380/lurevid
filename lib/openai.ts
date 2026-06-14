import OpenAI from "openai";
import { z } from "zod";
import type { StoryboardScene } from "@/lib/types";

const storyboardSchema = z.object({
  scenes: z
    .array(
      z.object({
        sceneNumber: z.number().int().min(1).max(9),
        title: z.string().min(1),
        visualGoal: z.string().min(1),
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

export async function createStoryboardBeats(idea: string): Promise<Omit<StoryboardScene, "seedancePrompt">[]> {
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
  beats: Omit<StoryboardScene, "seedancePrompt">[]
): Promise<StoryboardScene[]> {
  const openai = client();
  const model = process.env.OPENAI_PROMPT_MODEL || "gpt-5.4-mini";
  const response = await openai.responses.create({
    model,
    input: [
      {
        role: "system",
        content:
          "你是 Seedance 2.0 prompt engineer。把每個分鏡改寫成英文影片生成 prompt，必須連續一致、可商業使用、無字幕、無畫面文字。輸出只能是 JSON。"
      },
      {
        role: "user",
        content: JSON.stringify({
          idea,
          rules: [
            "正好 9 個 scenes",
            "保留 sceneNumber/title/visualGoal",
            "seedancePrompt 用英文，包含主體、場景、鏡頭、光線、動作、風格、避免文字"
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
                required: ["sceneNumber", "title", "visualGoal", "seedancePrompt"],
                properties: {
                  sceneNumber: { type: "number" },
                  title: { type: "string" },
                  visualGoal: { type: "string" },
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
