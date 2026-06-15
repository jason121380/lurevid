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
    expect(videoSettingsSchema.parse({ ratio: "9:16", resolution: "720p", duration: 5 })).toEqual({
      ratio: "9:16",
      resolution: "720p",
      duration: 5
    });
    expect(() => videoSettingsSchema.parse({ ratio: "4:3", resolution: "720p", duration: 5 })).toThrow();
    expect(() => videoSettingsSchema.parse({ ratio: "9:16", resolution: "8k", duration: 5 })).toThrow();
    expect(() => videoSettingsSchema.parse({ ratio: "9:16", resolution: "720p", duration: 15 })).toThrow();
  });

  it("falls back to current project video settings when payload is partial", () => {
    expect(parseVideoSettings({ duration: 3 }, { ratio: "16:9", resolution: "1080p", duration: 5 })).toEqual({
      ratio: "16:9",
      resolution: "1080p",
      duration: 3
    });
  });

  it("caps create project settings to the same public choices", () => {
    expect(
      createProjectSchema.parse({
        sourceUrl: "https://www.instagram.com/reel/abc/",
        settings: { ratio: "1:1", resolution: "480p", duration: 4 }
      }).settings
    ).toEqual({ ratio: "1:1", resolution: "480p", duration: 4 });
    expect(() =>
      createProjectSchema.parse({
        sourceUrl: "https://www.instagram.com/reel/abc/",
        settings: { ratio: "1:1", resolution: "720p", duration: 2 }
      })
    ).toThrow();
  });
});

