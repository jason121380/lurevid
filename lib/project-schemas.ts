import { z } from "zod";

export const createProjectSchema = z.object({
  title: z.string().trim().max(80, "專案名稱太長").optional(),
  sourceUrl: z.string().url(),
  settings: z
    .object({
      ratio: z.literal("9:16").default("9:16"),
      resolution: z.literal("720p").default("720p"),
      duration: z.union([z.literal(8), z.literal(15)]).default(8)
    })
    .default({})
});

export const videoSettingsSchema = z.object({
  ratio: z.literal("9:16"),
  resolution: z.literal("720p"),
  duration: z.union([z.literal(8), z.literal(15)])
});

export function parseVideoSettings(input: unknown, fallback: z.infer<typeof videoSettingsSchema>) {
  const body = typeof input === "object" && input !== null ? input : {};
  const duration = "duration" in body && Number.isInteger(body.duration) ? body.duration : fallback.duration;
  return videoSettingsSchema.parse({
    ratio: "9:16",
    resolution: "720p",
    duration: duration === 15 ? 15 : 8
  });
}
