import { afterEach, describe, expect, it, vi } from "vitest";
import { probeCobalt } from "@/lib/cobalt";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const HEALTHY = { cobalt: { version: "10.0.3", services: ["youtube", "tiktok", "instagram", "twitter"] } };

describe("probeCobalt", () => {
  it("reports 'unset' rather than an error when Cobalt is simply not configured", async () => {
    vi.stubEnv("COBALT_API_URL", "");
    const probe = await probeCobalt();
    expect(probe.state).toBe("unset");
    // Cobalt 是選配，沒設定不該被當成故障，但要說清楚 YouTube 會受影響。
    expect(probe.detail).toContain("YouTube");
  });

  it("reports the version when the API answers", async () => {
    const probe = await probeCobalt({ apiUrl: "http://cobalt.internal:9000/", fetchImpl: async () => jsonResponse(HEALTHY) });
    expect(probe.state).toBe("ok");
    expect(probe.detail).toContain("10.0.3");
  });

  it("warns when the instance does not carry a platform the allowlist accepts", async () => {
    const probe = await probeCobalt({
      apiUrl: "http://cobalt.internal:9000/",
      fetchImpl: async () => jsonResponse({ cobalt: { version: "10.0.3", services: ["tiktok", "instagram"] } })
    });
    expect(probe.state).toBe("warn");
    expect(probe.detail).toContain("youtube");
  });

  it("flags a URL that answers but is not a Cobalt API", async () => {
    const probe = await probeCobalt({
      apiUrl: "http://cobalt.internal:9000/",
      fetchImpl: async () => jsonResponse({ hello: "world" })
    });
    expect(probe.state).toBe("error");
    expect(probe.detail).toContain("不是 Cobalt API");
  });

  it("rejects a non-http Cobalt URL without calling fetch", async () => {
    const fetchImpl = vi.fn();
    const probe = await probeCobalt({ apiUrl: "file:///etc/passwd", fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(probe.state).toBe("error");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("never puts the upstream error text or the internal hostname in the detail", async () => {
    // 連線錯誤的原文長這樣：getaddrinfo ENOTFOUND cobalt-api.zeabur.internal
    const probe = await probeCobalt({
      apiUrl: "http://cobalt-api.zeabur.internal:9000/",
      fetchImpl: async () => {
        throw new Error("getaddrinfo ENOTFOUND cobalt-api.zeabur.internal");
      }
    });
    expect(probe.state).toBe("error");
    expect(probe.detail).not.toContain("zeabur.internal");
    expect(probe.detail).not.toContain("ENOTFOUND");
  });

  it("does not echo a hostile version string back into the dashboard", async () => {
    const probe = await probeCobalt({
      apiUrl: "http://cobalt.internal:9000/",
      fetchImpl: async () => jsonResponse({ cobalt: { version: "<img src=x onerror=alert(1)>", services: ["youtube", "tiktok", "instagram"] } })
    });
    expect(probe.state).toBe("ok");
    expect(probe.detail).toBe("已連線");
  });

  it("surfaces the HTTP status when Cobalt answers with an error", async () => {
    const probe = await probeCobalt({
      apiUrl: "http://cobalt.internal:9000/",
      fetchImpl: async () => jsonResponse({ error: { code: "nope" } }, 502)
    });
    expect(probe.state).toBe("error");
    expect(probe.detail).toContain("502");
  });
});
