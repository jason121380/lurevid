import { afterEach, describe, expect, it, vi } from "vitest";
import { assertSafeRemoteUrl, safeFetch } from "@/lib/safe-fetch";
import { detectPlatform, isSupportedSourceUrl, normalizeSourceUrl } from "@/lib/transcribe";

describe("source URL validation", () => {
  it("accepts supported public TikTok hosts", () => {
    expect(isSupportedSourceUrl("https://www.tiktok.com/@user/video/1234567890")).toBe(true);
  });

  it("rejects unsupported protocols and lookalike hosts", () => {
    expect(isSupportedSourceUrl("file:///etc/passwd")).toBe(false);
    expect(isSupportedSourceUrl("https://instagram.com.evil.test/reel/abc")).toBe(false);
    expect(detectPlatform("https://127.0.0.1/reel/abc")).toBe("Unknown");
  });

  it("rejects Instagram and Douyin links", () => {
    expect(isSupportedSourceUrl("https://www.instagram.com/reel/abc/")).toBe(false);
    expect(isSupportedSourceUrl("https://www.douyin.com/video/123")).toBe(false);
    expect(isSupportedSourceUrl("https://www.douyin.com/jingxuan?modal_id=7651578600051756778")).toBe(false);
  });

  it("normalizes accepted URLs without changing hosts", () => {
    expect(normalizeSourceUrl("https://www.tiktok.com/@user/video/1234567890")).toBe(
      "https://www.tiktok.com/@user/video/1234567890"
    );
  });
});

describe("safe remote fetch", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects private network URLs", async () => {
    await expect(assertSafeRemoteUrl("http://127.0.0.1:3000/file.mp4")).rejects.toThrow("內網");
    await expect(assertSafeRemoteUrl("http://169.254.169.254/latest/meta-data")).rejects.toThrow("內網");
  });

  it("revalidates redirect targets", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 302, headers: { location: "http://127.0.0.1/private" } }))
    );

    await expect(safeFetch("https://example.com/video", { timeoutMs: 1000 })).rejects.toThrow("內網");
  });
});
