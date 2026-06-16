import { describe, expect, it } from "vitest";
import { maskSecret } from "@/lib/settings";
import { createProjectSchema, parseVideoSettings, videoSettingsSchema } from "@/lib/project-schemas";

describe("settings helpers", () => {
  it("masks configured secret values without exposing full keys", () => {
    expect(maskSecret("")).toBe("");
    expect(maskSecret("abcd1234")).toBe("••••••••");
    expect(maskSecret("sk-abcdefghijklmnopqrstuvwxyz")).toBe("sk-a••••wxyz");
  });
});

describe("project schemas", () => {
  it("accepts only supported video generation settings", () => {
    expect(videoSettingsSchema.parse({ ratio: "9:16", resolution: "720p", duration: 8 })).toEqual({
      ratio: "9:16",
      resolution: "720p",
      duration: 8
    });
    expect(videoSettingsSchema.parse({ ratio: "9:16", resolution: "720p", duration: 15 }).duration).toBe(15);
    expect(() => videoSettingsSchema.parse({ ratio: "4:3", resolution: "720p", duration: 8 })).toThrow();
    expect(() => videoSettingsSchema.parse({ ratio: "9:16", resolution: "1080p", duration: 8 })).toThrow();
    expect(() => videoSettingsSchema.parse({ ratio: "9:16", resolution: "720p", duration: 5 })).toThrow();
  });

  it("falls back to current project video settings when payload is partial", () => {
    expect(parseVideoSettings({ duration: 15 }, { ratio: "9:16", resolution: "720p", duration: 8 })).toEqual({
      ratio: "9:16",
      resolution: "720p",
      duration: 15
    });
    expect(parseVideoSettings({ duration: 5 }, { ratio: "9:16", resolution: "720p", duration: 8 })).toEqual({
      ratio: "9:16",
      resolution: "720p",
      duration: 8
    });
  });

  it("caps create project settings to the same public choices", () => {
    expect(
      createProjectSchema.parse({
        sourceUrl: "https://www.tiktok.com/@user/video/1234567890",
        settings: { ratio: "9:16", resolution: "720p", duration: 8 }
      }).settings
    ).toEqual({ ratio: "9:16", resolution: "720p", duration: 8 });
    expect(() =>
      createProjectSchema.parse({
        sourceUrl: "https://www.tiktok.com/@user/video/1234567890",
        settings: { ratio: "1:1", resolution: "720p", duration: 8 }
      })
    ).toThrow();
  });
});
