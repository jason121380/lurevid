import { createWriteStream } from "node:fs";
import { rm } from "node:fs/promises";
import { Readable, Transform } from "node:stream";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { pipeline } from "node:stream/promises";
import { DEFAULT_MAX_DOWNLOAD_BYTES } from "@/lib/safe-fetch";

export type CobaltDownloadOptions = {
  apiUrl?: string;
  fetchImpl?: typeof fetch;
  maxBytes?: number;
};

export async function downloadWithCobalt(
  sourceUrl: string,
  outputPath: string,
  options: CobaltDownloadOptions = {}
): Promise<boolean> {
  const rawApiUrl = options.apiUrl ?? process.env.COBALT_API_URL ?? "";
  if (!rawApiUrl.trim()) return false;

  try {
    let apiUrl: URL;
    try {
      apiUrl = new URL(rawApiUrl);
    } catch {
      throw new Error("Cobalt 設定無效");
    }
    if (apiUrl.protocol !== "http:" && apiUrl.protocol !== "https:") throw new Error("Cobalt 設定無效");

    const fetchImpl = options.fetchImpl ?? fetch;
    const maxBytes = options.maxBytes ?? DEFAULT_MAX_DOWNLOAD_BYTES;
    const response = await fetchImpl(apiUrl, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({
        url: sourceUrl,
        downloadMode: "auto",
        alwaysProxy: true,
        videoQuality: "1080",
        youtubeVideoCodec: "h264",
        youtubeVideoContainer: "mp4"
      }),
      signal: AbortSignal.timeout(30_000)
    });
    if (!response.ok) throw new Error("Cobalt API 無法使用");

    const result = await response.json() as unknown;
    if (!result || typeof result !== "object") throw new Error("Cobalt 無法提供單一影片");
    const { status, url } = result as { status?: string; url?: string };
    if (status !== "tunnel" || !url) throw new Error("Cobalt 無法提供單一影片");

    let tunnelUrl: URL;
    try {
      tunnelUrl = new URL(url);
    } catch {
      throw new Error("Cobalt 回傳不安全的下載位置");
    }
    if (tunnelUrl.origin !== apiUrl.origin) throw new Error("Cobalt 回傳不安全的下載位置");

    const tunnel = await fetchImpl(tunnelUrl, {
      redirect: "error",
      signal: AbortSignal.timeout(30_000)
    });
    if (!tunnel.ok || !tunnel.body) throw new Error("Cobalt 影片串流無法使用");

    const declaredLength = tunnel.headers.get("content-length");
    if (declaredLength && (!Number.isFinite(Number(declaredLength)) || Number(declaredLength) > maxBytes)) {
      throw new Error("下載檔案超過大小限制");
    }

    let downloaded = 0;
    const limiter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        downloaded += chunk.length;
        if (downloaded > maxBytes) {
          callback(new Error("下載檔案超過大小限制"));
          return;
        }
        callback(null, chunk);
      }
    });

    await pipeline(
      Readable.fromWeb(tunnel.body as unknown as NodeReadableStream<Uint8Array>),
      limiter,
      createWriteStream(outputPath)
    );

    return true;
  } catch (error) {
    await rm(outputPath, { force: true });
    throw error;
  }
}
