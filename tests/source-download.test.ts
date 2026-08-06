import { access, readFile, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { describe, expect, it } from "vitest";
import { createSourceVideoDownloader } from "@/lib/visual";

const YOUTUBE_URL = "https://youtu.be/dQw4w9WgXcQ";

describe("source video downloads", () => {
  it("uses Cobalt first and skips yt-dlp when Cobalt succeeds", async () => {
    const events: string[] = [];
    const download = createSourceVideoDownloader({
      cobalt: async (_url, outputPath) => {
        events.push("cobalt");
        await writeFile(outputPath, "video");
        return true;
      },
      ytdlp: async () => {
        events.push("ytdlp");
      }
    });

    const result = await download(YOUTUBE_URL);

    expect(events).toEqual(["cobalt"]);
    await expect(readFile(result.path, "utf8")).resolves.toBe("video");
    await rm(result.dir, { recursive: true, force: true });
  });

  it("falls back to yt-dlp when Cobalt is disabled or throws", async () => {
    for (const cobalt of [async () => false, async () => { throw new Error("offline"); }]) {
      const events: string[] = [];
      const download = createSourceVideoDownloader({
        cobalt,
        ytdlp: async (url, outputPattern) => {
          events.push(`ytdlp:${url}`);
          await writeFile(outputPattern.replace("%(ext)s", "mp4"), "fallback-video");
        }
      });

      const result = await download(YOUTUBE_URL);

      expect(events).toContain(`ytdlp:${YOUTUBE_URL}`);
      await expect(readFile(result.path, "utf8")).resolves.toBe("fallback-video");
      await rm(result.dir, { recursive: true, force: true });
    }
  });

  it("removes the temporary directory when both downloaders fail", async () => {
    let directory = "";
    const download = createSourceVideoDownloader({
      cobalt: async () => false,
      ytdlp: async (_url, outputPattern) => {
        directory = dirname(outputPattern);
        await writeFile(outputPattern.replace("%(ext)s", "mp4"), "partial-video");
        throw new Error("download failed");
      }
    });

    await expect(download(YOUTUBE_URL)).rejects.toThrow();
    expect(directory).not.toBe("");
    await expect(access(directory)).rejects.toThrow();
  });
});
