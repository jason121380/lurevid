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

export type CobaltProbe = { state: "ok" | "warn" | "unset" | "error"; detail: string };

const COBALT_PROBE_TIMEOUT_MS = 5_000;

/** allowlist 用得到的 Cobalt service 名稱。只做成員判斷，不回顯上游字串。 */
const REQUIRED_SERVICES = ["youtube", "tiktok", "instagram"] as const;

function safeCobaltVersion(value: unknown) {
  return typeof value === "string" && /^[0-9][0-9a-z.+-]{0,30}$/i.test(value) ? value : null;
}

/**
 * 確認 Cobalt 真的接得上。只有 Worker 有 COBALT_API_URL，所以只有 Worker 跑得了這個探測；
 * 少了它，設定打錯字只會每次安靜地回退 yt-dlp，從畫面上完全看不出來。
 *
 * 回傳的 detail 只含我們自己寫的字、經過白名單的版本號與服務名稱，
 * 絕不放上游回應或錯誤訊息——那裡面會有內部主機名稱。
 */
export async function probeCobalt(options: { apiUrl?: string; fetchImpl?: typeof fetch } = {}): Promise<CobaltProbe> {
  const rawApiUrl = options.apiUrl ?? process.env.COBALT_API_URL ?? "";
  if (!rawApiUrl.trim()) {
    return { state: "unset", detail: "未設定（YouTube 從機房 IP 多半會被擋，需要 Cobalt）" };
  }

  let apiUrl: URL;
  try {
    apiUrl = new URL(rawApiUrl);
  } catch {
    return { state: "error", detail: "COBALT_API_URL 格式無效" };
  }
  if (apiUrl.protocol !== "http:" && apiUrl.protocol !== "https:") {
    return { state: "error", detail: "COBALT_API_URL 必須是 http 或 https" };
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  try {
    const response = await fetchImpl(apiUrl, {
      method: "GET",
      redirect: "error",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(COBALT_PROBE_TIMEOUT_MS)
    });
    if (!response.ok) return { state: "error", detail: `Cobalt 回應 HTTP ${response.status}` };

    const body = (await response.json()) as unknown;
    const info = body && typeof body === "object" ? (body as { cobalt?: unknown }).cobalt : null;
    if (!info || typeof info !== "object") {
      return { state: "error", detail: "回應不是 Cobalt API（請確認網址指向 API 服務而非前端）" };
    }

    const version = safeCobaltVersion((info as { version?: unknown }).version);
    const label = version ? `已連線（Cobalt ${version}）` : "已連線";

    const services = (info as { services?: unknown }).services;
    const list = Array.isArray(services) ? services.filter((item): item is string => typeof item === "string") : [];
    const missing = REQUIRED_SERVICES.filter((name) => !list.includes(name));
    if (list.length > 0 && missing.length > 0) {
      return { state: "warn", detail: `${label}，但這台不支援 ${missing.join("、")}，該平台會回退 yt-dlp` };
    }

    return { state: "ok", detail: label };
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    if (name === "TimeoutError" || name === "AbortError") {
      return { state: "error", detail: "連線逾時（5 秒內沒有回應）" };
    }
    return { state: "error", detail: "連不上（請確認服務名稱、埠號，以及兩個服務在同一個 Project 內網）" };
  }
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
