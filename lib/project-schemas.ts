import { z } from "zod";

export const createProjectSchema = z.object({
  title: z.string().trim().max(80, "專案名稱太長").optional(),
  sourceUrl: z.string().url(),
  settings: z
    .object({
      ratio: z.enum(["9:16", "16:9", "1:1"]).default("9:16"),
      resolution: z.enum(["480p", "720p", "1080p"]).default("720p"),
      duration: z.union([z.literal(3), z.literal(4), z.literal(5)]).default(5)
    })
    .default({})
});

export const videoSettingsSchema = z.object({
  ratio: z.enum(["9:16", "16:9", "1:1"]),
  resolution: z.enum(["480p", "720p", "1080p"]),
  duration: z.union([z.literal(3), z.literal(4), z.literal(5)])
});

export function parseVideoSettings(input: unknown, fallback: z.infer<typeof videoSettingsSchema>) {
  const body = typeof input === "object" && input !== null ? input : {};
  return videoSettingsSchema.parse({
    ratio: "ratio" in body && typeof body.ratio === "string" ? body.ratio : fallback.ratio,
    resolution: "resolution" in body && typeof body.resolution === "string" ? body.resolution : fallback.resolution,
    duration: "duration" in body && Number.isInteger(body.duration) ? body.duration : fallback.duration
  });
}
