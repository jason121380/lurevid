import { describe, expect, it } from "vitest";
import { describeDownloadError, detectPlatform, isStoryUrl, isSupportedSourceUrl, normalizeSourceUrl } from "@/lib/transcribe";

describe("source URL support", () => {
  it("accepts TikTok URLs", () => {
    expect(isSupportedSourceUrl("https://www.tiktok.com/@user/video/1234567890")).toBe(true);
    expect(detectPlatform("https://www.tiktok.com/@user/video/1234567890")).toBe("TikTok");
  });

  it("accepts Instagram Reels URLs", () => {
    const url = "https://www.instagram.com/reel/ABC123/?igsh=demo";

    expect(isSupportedSourceUrl(url)).toBe(true);
    expect(detectPlatform(url)).toBe("Instagram");
    expect(normalizeSourceUrl(url)).toBe("https://www.instagram.com/reel/ABC123/?igsh=demo");
  });

  it("rejects unsupported hosts", () => {
    expect(isSupportedSourceUrl("https://example.com/video/123")).toBe(false);
  });

  it("rejects non-Reels Instagram URLs", () => {
    expect(isSupportedSourceUrl("https://www.instagram.com/some-profile/")).toBe(false);
    expect(isSupportedSourceUrl("https://www.instagram.com/p/ABC123/")).toBe(false);
  });
});

describe("Facebook / Instagram stories", () => {
  const FB_STORY =
    "https://www.facebook.com/stories/108389491301288/UzpfSVNDOjQ1OTY5NjQ0MzA2MjUyMzI=/?view_single=1&source=shared_permalink&mibextid=wwXIfr";

  it("accepts a shared Facebook story permalink", () => {
    expect(isSupportedSourceUrl(FB_STORY)).toBe(true);
    expect(detectPlatform(FB_STORY)).toBe("Facebook");
  });

  it("survives the base64 padding in the story path", () => {
    expect(normalizeSourceUrl(FB_STORY)).toContain("UzpfSVNDOjQ1OTY5NjQ0MzA2MjUyMzI=");
  });

  it("accepts Instagram stories alongside reels", () => {
    const story = "https://www.instagram.com/stories/someone/3512345678901234567/";
    expect(isSupportedSourceUrl(story)).toBe(true);
    expect(detectPlatform(story)).toBe("Instagram");
    expect(isStoryUrl(story)).toBe(true);
  });

  it("does not open up the rest of Facebook", () => {
    for (const url of [
      "https://www.facebook.com/somepage/posts/123",
      "https://www.facebook.com/watch/?v=123",
      "https://www.facebook.com/",
      "https://www.facebook.com/groups/123"
    ]) {
      expect(isSupportedSourceUrl(url)).toBe(false);
    }
  });

  it("still rejects lookalike hosts", () => {
    for (const url of [
      "https://facebook.com.evil.test/stories/1/",
      "https://notfacebook.com/stories/1/",
      "https://evil.test/?x=facebook.com/stories/1"
    ]) {
      expect(isSupportedSourceUrl(url)).toBe(false);
    }
  });

  it("marks reels and TikTok as non-stories", () => {
    expect(isStoryUrl("https://www.instagram.com/reel/ABC123/")).toBe(false);
    expect(isStoryUrl("https://www.tiktok.com/@user/video/123")).toBe(false);
  });
});

describe("story download errors", () => {
  const STORY = "https://www.facebook.com/stories/108389491301288/UzpfSVND/";
  const REEL = "https://www.instagram.com/reel/ABC123/";
  const raw = new Error("ERROR: [facebook] Cannot parse data; login required");

  it("tells you to add cookies when none are configured", () => {
    const message = describeDownloadError(raw, { sourceUrl: STORY, hasCookies: false }).message;
    expect(message).toContain("填入 yt-dlp cookies");
  });

  it("stops telling you to add cookies once they are configured", () => {
    const message = describeDownloadError(raw, { sourceUrl: STORY, hasCookies: true }).message;
    expect(message).not.toContain("填入 yt-dlp cookies");
    expect(message).toContain("已過期");
  });

  it("does not mention cookies for non-story links", () => {
    const message = describeDownloadError(raw, { sourceUrl: REEL, hasCookies: false }).message;
    expect(message).not.toContain("cookies");
  });

  it("never leaks the raw yt-dlp output or the url", () => {
    for (const options of [{ sourceUrl: STORY, hasCookies: false }, { sourceUrl: STORY, hasCookies: true }]) {
      const message = describeDownloadError(raw, options).message;
      expect(message).not.toContain("facebook.com/stories");
      expect(message).not.toContain("Cannot parse data");
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
});
