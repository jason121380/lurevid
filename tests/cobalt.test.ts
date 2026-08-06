import { mkdtemp, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { downloadWithCobalt } from "@/lib/cobalt";

const temporaryDirectories: string[] = [];

async function outputPath() {
  const directory = await mkdtemp(join(tmpdir(), "lurevid-cobalt-"));
  temporaryDirectories.push(directory);
  return join(directory, "source.mp4");
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })));
});

describe("downloadWithCobalt", () => {
  it("returns false without a configured Cobalt URL", async () => {
    const path = await outputPath();

    await expect(downloadWithCobalt("https://youtu.be/demo", path, { apiUrl: "" })).resolves.toBe(false);
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
    expect(calls[1].init?.redirect).toBe("error");
    expect(await readFile(path, "utf8")).toBe("video-bytes");
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
