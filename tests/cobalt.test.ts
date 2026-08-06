import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadWithCobalt } from "@/lib/cobalt";

const temporaryDirectories: string[] = [];

async function outputPath() {
  const directory = await mkdtemp(join(tmpdir(), "lurevid-cobalt-"));
  temporaryDirectories.push(directory);
  return join(directory, "source.mp4");
}

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.resetModules();
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })));
});

describe("downloadWithCobalt", () => {
  it("returns false without a configured Cobalt URL", async () => {
    const path = await outputPath();

    await expect(downloadWithCobalt("https://youtu.be/demo", path, { apiUrl: "" })).resolves.toBe(false);
  });

  it("reports only the HTTP status and safe Cobalt error code", async () => {
    const path = await outputPath();
    const fetchImpl: typeof fetch = async () => Response.json({
      status: "error",
      error: {
        code: "error.api.youtube.login",
        context: { url: "https://secret.example/video", cookie: "private-cookie" }
      }
    }, { status: 400 });

    let caught: unknown;
    try {
      await downloadWithCobalt("https://youtu.be/demo", path, {
        apiUrl: "http://cobalt-api.zeabur.internal:9000/",
        fetchImpl
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toBe("Cobalt API HTTP 400 (error.api.youtube.login)");
    expect((caught as Error).message).not.toContain("secret.example");
    expect((caught as Error).message).not.toContain("private-cookie");
  });

  it("omits unsafe Cobalt error codes from diagnostics", async () => {
    const path = await outputPath();
    const fetchImpl: typeof fetch = async () => Response.json({
      status: "error",
      error: { code: "token=secret value" }
    }, { status: 401 });

    await expect(downloadWithCobalt("https://youtu.be/demo", path, {
      apiUrl: "http://cobalt-api.zeabur.internal:9000/",
      fetchImpl
    })).rejects.toThrow("Cobalt API HTTP 401");
  });

  it("removes a seeded output when the Cobalt URL is invalid", async () => {
    const path = await outputPath();
    await writeFile(path, "stale partial video");

    await expect(downloadWithCobalt("https://youtu.be/demo", path, { apiUrl: "not a URL" })).rejects.toThrow("設定無效");

    expect(existsSync(path)).toBe(false);
  });

  it("requests an always-proxied MP4 and writes the tunnel body", async () => {
    const path = await outputPath();
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      calls.push({ url, init });
      if (calls.length === 1) {
        return Response.json({
          status: "tunnel",
          url: "http://cobalt-api.zeabur.internal:9000/tunnel?id=one",
          filename: "source.mp4"
        });
      }
      return new Response("video-bytes", { status: 200, headers: { "content-length": "11" } });
    };

    await expect(downloadWithCobalt("https://youtu.be/demo", path, {
      apiUrl: "http://cobalt-api.zeabur.internal:9000/",
      fetchImpl
    })).resolves.toBe(true);

    expect(calls).toHaveLength(2);
    expect(JSON.parse(String(calls[0].init?.body))).toMatchObject({
      url: "https://youtu.be/demo",
      alwaysProxy: true,
      videoQuality: "1080",
      youtubeVideoContainer: "mp4"
    });
    expect(calls.map(({ init }) => init?.redirect)).toEqual(["error", "error"]);
    expect(await readFile(path, "utf8")).toBe("video-bytes");
  });

  it("uses separate API and download timeouts", async () => {
    const path = await outputPath();
    const timeout = vi.spyOn(AbortSignal, "timeout").mockImplementation(() => new AbortController().signal);
    const fetchImpl: typeof fetch = async (_input, init) => {
      if (init?.method === "POST") {
        return Response.json({
          status: "tunnel",
          url: "http://cobalt-api.zeabur.internal:9000/tunnel?id=one"
        });
      }
      return new Response("video-bytes", { status: 200 });
    };

    await expect(downloadWithCobalt("https://youtu.be/demo", path, {
      apiUrl: "http://cobalt-api.zeabur.internal:9000/",
      fetchImpl,
      downloadTimeoutMs: 3_600_001
    })).resolves.toBe(true);

    expect(timeout.mock.calls).toEqual([[30_000], [3_600_001]]);
  });

  it("defaults the download timeout beyond the longest supported video duration", async () => {
    const path = await outputPath();
    const timeout = vi.spyOn(AbortSignal, "timeout").mockImplementation(() => new AbortController().signal);
    const fetchImpl: typeof fetch = async (_input, init) => {
      if (init?.method === "POST") {
        return Response.json({
          status: "tunnel",
          url: "http://cobalt-api.zeabur.internal:9000/tunnel?id=one"
        });
      }
      return new Response("video-bytes", { status: 200 });
    };

    await expect(downloadWithCobalt("https://youtu.be/demo", path, {
      apiUrl: "http://cobalt-api.zeabur.internal:9000/",
      fetchImpl
    })).resolves.toBe(true);

    expect(timeout.mock.calls[0]).toEqual([30_000]);
    expect(timeout.mock.calls[1][0]).toBeGreaterThan(3_600_000);
  });

  it.each([NaN, Infinity, 0, -1, 1.5])("rejects invalid maxBytes %s before fetching", async (maxBytes) => {
    const path = await outputPath();
    let fetched = false;
    const fetchImpl: typeof fetch = async () => {
      fetched = true;
      return new Response("unexpected");
    };

    await expect(downloadWithCobalt("https://youtu.be/demo", path, {
      apiUrl: "http://cobalt-api.zeabur.internal:9000/",
      fetchImpl,
      maxBytes
    })).rejects.toThrow("Cobalt 下載設定無效");

    expect(fetched).toBe(false);
  });

  it.each([NaN, Infinity, 0, -1, 1.5])(
    "rejects invalid downloadTimeoutMs %s before fetching",
    async (downloadTimeoutMs) => {
      const path = await outputPath();
      let fetched = false;
      const fetchImpl: typeof fetch = async () => {
        fetched = true;
        return new Response("unexpected");
      };

      await expect(downloadWithCobalt("https://youtu.be/demo", path, {
        apiUrl: "http://cobalt-api.zeabur.internal:9000/",
        fetchImpl,
        downloadTimeoutMs
      })).rejects.toThrow("Cobalt 下載設定無效");

      expect(fetched).toBe(false);
    }
  );

  it("fails closed when the production byte-limit environment value is invalid", async () => {
    vi.stubEnv("SAFE_FETCH_MAX_BYTES", "not-a-number");
    vi.resetModules();
    const { downloadWithCobalt: downloadWithInvalidEnvironment } = await import("@/lib/cobalt");
    const path = await outputPath();
    let fetched = false;
    const fetchImpl: typeof fetch = async () => {
      fetched = true;
      return new Response("unexpected");
    };

    await expect(downloadWithInvalidEnvironment("https://youtu.be/demo", path, {
      apiUrl: "http://cobalt-api.zeabur.internal:9000/",
      fetchImpl
    })).rejects.toThrow("Cobalt 下載設定無效");

    expect(fetched).toBe(false);
  });

  it.each(["redirect", "picker", "local-processing", "error"])(
    "rejects unsupported Cobalt status %s",
    async (status) => {
      const path = await outputPath();
      const fetchImpl: typeof fetch = async () => Response.json({
        status,
        url: "http://cobalt-api.zeabur.internal:9000/tunnel?id=one"
      });

      await expect(downloadWithCobalt("https://youtu.be/demo", path, {
        apiUrl: "http://cobalt-api.zeabur.internal:9000/",
        fetchImpl
      })).rejects.toThrow("Cobalt");
    }
  );

  it("rejects a tunnel outside the configured Cobalt origin", async () => {
    const path = await outputPath();
    const calls: string[] = [];
    const fetchImpl: typeof fetch = async (input) => {
      calls.push(String(input));
      return Response.json({
        status: "tunnel",
        url: "http://169.254.169.254/latest/meta-data"
      });
    };

    await expect(downloadWithCobalt("https://youtu.be/demo", path, {
      apiUrl: "http://cobalt-api.zeabur.internal:9000/",
      fetchImpl
    })).rejects.toThrow("不安全");

    expect(calls).toHaveLength(1);
  });

  it("rejects a malformed Cobalt tunnel URL without exposing parser details", async () => {
    const path = await outputPath();
    const fetchImpl: typeof fetch = async () => Response.json({ status: "tunnel", url: "not a URL" });

    await expect(downloadWithCobalt("https://youtu.be/demo", path, {
      apiUrl: "http://cobalt-api.zeabur.internal:9000/",
      fetchImpl
    })).rejects.toThrow("Cobalt");
  });

  it("rejects a null Cobalt response with a controlled error", async () => {
    const path = await outputPath();
    const fetchImpl: typeof fetch = async () => Response.json(null);

    await expect(downloadWithCobalt("https://youtu.be/demo", path, {
      apiUrl: "http://cobalt-api.zeabur.internal:9000/",
      fetchImpl
    })).rejects.toThrow("Cobalt 無法提供單一影片");
  });

  it("rejects a declared content length over the limit", async () => {
    const path = await outputPath();
    const fetchImpl: typeof fetch = async (_input, init) => {
      if (init?.method === "POST") {
        return Response.json({
          status: "tunnel",
          url: "http://cobalt-api.zeabur.internal:9000/tunnel?id=one"
        });
      }
      return new Response("eleven-bytes", { status: 200, headers: { "content-length": "11" } });
    };

    await expect(downloadWithCobalt("https://youtu.be/demo", path, {
      apiUrl: "http://cobalt-api.zeabur.internal:9000/",
      fetchImpl,
      maxBytes: 10
    })).rejects.toThrow("大小限制");

    expect(existsSync(path)).toBe(false);
  });

  it.each(["-1", "1.5", "1e1", "9007199254740992"])(
    "rejects malformed Content-Length %s",
    async (contentLength) => {
      const path = await outputPath();
      const fetchImpl: typeof fetch = async (_input, init) => {
        if (init?.method === "POST") {
          return Response.json({
            status: "tunnel",
            url: "http://cobalt-api.zeabur.internal:9000/tunnel?id=one"
          });
        }
        return new Response("video-bytes", { status: 200, headers: { "content-length": contentLength } });
      };

      await expect(downloadWithCobalt("https://youtu.be/demo", path, {
        apiUrl: "http://cobalt-api.zeabur.internal:9000/",
        fetchImpl
      })).rejects.toThrow("Cobalt 影片串流格式無效");

      expect(existsSync(path)).toBe(false);
    }
  );

  it("aborts streaming after the accumulated bytes exceed the limit", async () => {
    const path = await outputPath();
    const fetchImpl: typeof fetch = async (_input, init) => {
      if (init?.method === "POST") {
        return Response.json({
          status: "tunnel",
          url: "http://cobalt-api.zeabur.internal:9000/tunnel?id=one"
        });
      }
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("1234567"));
          controller.enqueue(new TextEncoder().encode("89012"));
          controller.close();
        }
      });
      return new Response(body, { status: 200 });
    };

    await expect(downloadWithCobalt("https://youtu.be/demo", path, {
      apiUrl: "http://cobalt-api.zeabur.internal:9000/",
      fetchImpl,
      maxBytes: 10
    })).rejects.toThrow("大小限制");

    expect(existsSync(path)).toBe(false);
  });
});
