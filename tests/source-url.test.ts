import { describe, expect, it } from "vitest";
import { describeDownloadError, detectPlatform, isSupportedSourceUrl, normalizeSourceUrl } from "@/lib/transcribe";

describe("source URL support", () => {
  it("accepts TikTok URLs", () => {
    expect(isSupportedSourceUrl("https://www.tiktok.com/@user/video/1234567890")).toBe(true);
    expect(detectPlatform("https://www.tiktok.com/@user/video/1234567890")).toBe("TikTok");
  });

  it("accepts Instagram Reels URLs", () => {
    const url = "https://www.instagram.com/reel/ABC123/?igsh=demo";
    expect(isSupportedSourceUrl(url)).toBe(true);
    expect(detectPlatform(url)).toBe("Instagram");
    expect(normalizeSourceUrl(url)).toContain("/reel/ABC123/");
  });

  it("accepts the plural /reels/ spelling", () => {
    expect(isSupportedSourceUrl("https://www.instagram.com/reels/ABC123/")).toBe(true);
  });

  it("rejects unsupported protocols and lookalike hosts", () => {
    for (const url of [
      "file:///etc/passwd",
      "https://instagram.com.evil.test/reel/abc",
      "https://nottiktok.com/@u/video/1",
      "https://evil.test/?x=tiktok.com"
    ]) {
      expect(isSupportedSourceUrl(url)).toBe(false);
    }
  });

  it("rejects Instagram paths that are not reels", () => {
    for (const url of [
      "https://www.instagram.com/",
      "https://www.instagram.com/someuser/",
      "https://www.instagram.com/p/ABC123/",
      "https://www.instagram.com/stories/someone/123/"
    ]) {
      expect(isSupportedSourceUrl(url)).toBe(false);
    }
  });
});

describe("platforms deliberately left out", () => {
  it("rejects Facebook entirely, including stories", () => {
    for (const url of [
      "https://www.facebook.com/stories/108389491301288/UzpfSVND/?view_single=1",
      "https://www.facebook.com/somepage/posts/123",
      "https://www.facebook.com/watch/?v=123"
    ]) {
      expect(isSupportedSourceUrl(url)).toBe(false);
      expect(detectPlatform(url)).toBe("Unknown");
    }
  });

  it("rejects YouTube in all of its URL shapes", () => {
    for (const url of [
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "https://youtu.be/dQw4w9WgXcQ",
      "https://www.youtube.com/shorts/abc123XYZ",
      "https://m.youtube.com/watch?v=dQw4w9WgXcQ",
      "https://www.youtube.com/live/abc123XYZ"
    ]) {
      expect(isSupportedSourceUrl(url)).toBe(false);
      expect(detectPlatform(url)).toBe("Unknown");
    }
  });
});

describe("download error next steps", () => {
  const cases = [
    new Error("ERROR: Unable to extract data"),
    new Error("HTTP Error 429: Too Many Requests"),
    new Error("ERROR: login required"),
    new Error("something else entirely")
  ];

  it("never points at a feature the app does not have", () => {
    for (const error of cases) {
      expect(describeDownloadError(error).message).not.toContain("手動輸入逐字稿");
    }
  });

  it("points at uploading, which does exist", () => {
    for (const error of cases) {
      expect(describeDownloadError(error).message).toContain("上傳影片");
    }
  });

  it("suggests cookies when a login wall is hit and none are set", () => {
    const message = describeDownloadError(new Error("ERROR: login required"), { hasCookies: false }).message;
    expect(message).toContain("cookies");
  });

  it("says cookies may be stale rather than asking for them again", () => {
    const message = describeDownloadError(new Error("ERROR: login required"), { hasCookies: true }).message;
    expect(message).toContain("已過期");
    expect(message).not.toContain("可在設定頁填入");
  });

  it("never leaks the raw yt-dlp output", () => {
    const raw = new Error("ERROR: [instagram] ABC123: Unable to extract shared data; url https://instagram.com/reel/ABC123");
    for (const hasCookies of [true, false]) {
      const message = describeDownloadError(raw, { hasCookies }).message;
      expect(message).not.toContain("ABC123");
      expect(message).not.toContain("instagram.com/reel");
    }
  });
});
