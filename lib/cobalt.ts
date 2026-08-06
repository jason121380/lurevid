import { createWriteStream } from "node:fs";
import { rm } from "node:fs/promises";
import { Readable, Transform } from "node:stream";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { pipeline } from "node:stream/promises";
import { DEFAULT_MAX_DOWNLOAD_BYTES } from "@/lib/safe-fetch";

const COBALT_API_TIMEOUT_MS = 30_000;
const DEFAULT_COBALT_DOWNLOAD_TIMEOUT_MS = 3_660_000;

export type CobaltDownloadOptions = {
  apiUrl?: string;
  fetchImpl?: typeof fetch;
  maxBytes?: number;
  downloadTimeoutMs?: number;
};

function isPositiveSafeInteger(value: number) {
  return Number.isSafeInteger(value) && value > 0;
}

function safeCobaltErrorCode(value: unknown) {
  return typeof value === "string" && /^[a-z0-9._-]{1,120}$/i.test(value) ? value : null;
}

async function describeCobaltHttpError(response: Response) {
  let code: string | null = null;
  try {
    const body = await response.json() as unknown;
    if (body && typeof body === "object") {
      const error = (body as { error?: unknown }).error;
      if (error && typeof error === "object") {
        code = safeCobaltErrorCode((error as { code?: unknown }).code);
      }
    }
  } catch {
    // 非 JSON 回應只記錄 HTTP 狀態，避免洩漏上游回應內容。
  }
  return `Cobalt API HTTP ${response.status}${code ? ` (${code})` : ""}`;
}

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
    const downloadTimeoutMs = options.downloadTimeoutMs ?? DEFAULT_COBALT_DOWNLOAD_TIMEOUT_MS;
    if (!isPositiveSafeInteger(maxBytes) || !isPositiveSafeInteger(downloadTimeoutMs)) {
      throw new Error("Cobalt 下載設定無效");
    }

    const response = await fetchImpl(apiUrl, {
      method: "POST",
      redirect: "error",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({
        url: sourceUrl,
        downloadMode: "auto",
        alwaysProxy: true,
        videoQuality: "1080",
        youtubeVideoCodec: "h264",
        youtubeVideoContainer: "mp4"
      }),
      signal: AbortSignal.timeout(COBALT_API_TIMEOUT_MS)
    });
    if (!response.ok) throw new Error(await describeCobaltHttpError(response));

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
      signal: AbortSignal.timeout(downloadTimeoutMs)
    });
    if (!tunnel.ok || !tunnel.body) throw new Error("Cobalt 影片串流無法使用");

    const declaredLength = tunnel.headers.get("content-length");
    if (declaredLength !== null) {
      if (!/^\d+$/.test(declaredLength) || !Number.isSafeInteger(Number(declaredLength))) {
        throw new Error("Cobalt 影片串流格式無效");
      }
      if (Number(declaredLength) > maxBytes) throw new Error("下載檔案超過大小限制");
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
