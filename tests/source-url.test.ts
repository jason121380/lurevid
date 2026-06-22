import { describe, expect, it } from "vitest";
import { detectPlatform, isSupportedSourceUrl, normalizeSourceUrl } from "@/lib/transcribe";

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
