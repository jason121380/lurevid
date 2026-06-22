import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Uploadable } from "openai";
import { openaiClient } from "@/lib/openai";
import { ffmpegPath } from "@/lib/ffmpeg";
import { getAppSettings } from "@/lib/settings";

const ALLOWED_HOSTS = ["tiktok.com", "instagram.com"];

function parseAllowedUrl(url: string): URL | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  const host = parsed.hostname.toLowerCase();
  const allowed = ALLOWED_HOSTS.some((base) => host === base || host.endsWith(`.${base}`));
  if (!allowed) return null;
  if ((host === "instagram.com" || host.endsWith(".instagram.com")) && !/^\/reels?\//i.test(parsed.pathname)) return null;
  return parsed;
}

export function detectPlatform(url: string) {
  const parsed = parseAllowedUrl(url);
  if (!parsed) return "Unknown";
  const host = parsed.hostname.toLowerCase();
  if (host === "tiktok.com" || host.endsWith(".tiktok.com")) return "TikTok";
  if (host === "instagram.com" || host.endsWith(".instagram.com")) return "Instagram";
  return "Unknown";
}

/**
 * 只接受 http(s) 的短影音來源連結。
 * 用 URL 解析（而非寬鬆 regex）以擋掉內網 SSRF 與 yt-dlp 參數注入（例如 `-` 開頭）。
 */
export function isSupportedSourceUrl(url: string) {
  return parseAllowedUrl(url) !== null && detectPlatform(url) !== "Unknown";
}

export function normalizeSourceUrl(url: string) {
  const parsed = parseAllowedUrl(url);
  if (!parsed) return url;
  return parsed.toString();
}

function run(command: string, args: string[]) {
  return new Promise<void>((resolvePromise, reject) => {
    const child = spawn(command, args);
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(stderr.trim() || `${command} 失敗（exit ${code}）`));
    });
  });
}

const TRANSCRIBABLE_EXTENSIONS = new Set(["mp3", "mp4", "mpeg", "mpga", "m4a", "wav", "webm"]);

function timestamp(seconds: number) {
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  return `${minutes}:${String(secs).padStart(2, "0")}`;
}

function formatTimestampedTranscript(result: {
  text?: string;
  segments?: Array<{ start: number; end: number; text: string }>;
}) {
  const segments = result.segments?.filter((segment) => segment.text?.trim()) || [];
  if (segments.length === 0) return result.text?.trim() || "";

  return segments
    .map((segment) => `[${timestamp(segment.start)} - ${timestamp(segment.end)}] ${segment.text.trim()}`)
    .join("\n");
}

/**
 * 把 yt-dlp／下載失敗的原始錯誤轉成乾淨的使用者訊息，
 * 不外洩原始 stderr、影片 ID 或網址（符合專案的錯誤訊息規範）。
 */
export function describeDownloadError(error: unknown): Error {
  const text = (error instanceof Error ? error.message : String(error || "")).toLowerCase();
  if (/rehydration|unable to extract|extractor|unable to download webpage/.test(text)) {
    return new Error("來源平台暫時無法下載（可能是平台改版或此伺服器 IP 被限制）。請稍後再試，或改用手動輸入逐字稿。");
  }
  if (/429|too many requests|rate.?limit/.test(text)) {
    return new Error("來源平台暫時限流（429）。請稍後再試，或改用手動輸入逐字稿。");
  }
  if (/login|sign in|private|verification|captcha|robot|forbidden|403/.test(text)) {
    return new Error("此影片需要登入或被來源平台阻擋，無法自動下載。請改用公開影片連結，或手動輸入逐字稿。");
  }
  return new Error("影片下載失敗。請確認連結有效且為公開影片，稍後再試，或改用手動輸入逐字稿。");
}

/**
 * 用 yt-dlp 下載影片音訊，再用 OpenAI 轉成逐字稿。
 * 優先下載原始音訊格式，避免本機分析階段依賴 ffmpeg。
 * 下載失敗時拋錯，由 worker 顯示重試或換公開連結。
 */
export async function fetchTranscript(url: string): Promise<string> {
  if (!isSupportedSourceUrl(url)) throw new Error("不支援的來源影片連結");
  const normalizedUrl = normalizeSourceUrl(url);
  const dir = await mkdtemp(join(tmpdir(), "lurevid-"));
  try {
    try {
      await run("yt-dlp", [
        "-f",
        "bestaudio/best",
        "--no-playlist",
        "--no-warnings",
        "--ffmpeg-location",
        ffmpegPath(),
        "-o",
        join(dir, "source.%(ext)s"),
        "--",
        normalizedUrl
      ]);
    } catch (error) {
      throw describeDownloadError(error);
    }

    const files = await readdir(dir);
    const audio = files.find((file) => TRANSCRIBABLE_EXTENSIONS.has(file.split(".").pop()?.toLowerCase() || ""));
    if (!audio) throw new Error("yt-dlp 沒有輸出可轉錄的音訊檔");

    return await transcribeMediaFile(join(dir, audio));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function transcribeMediaFile(path: string): Promise<string> {
  const settings = await getAppSettings();
  // gpt-realtime-whisper 是 Realtime 串流模型，不能丟到檔案轉錄 endpoint，改用 gpt-4o-transcribe。
  const configuredModel =
    settings.OPENAI_TRANSCRIBE_MODEL === "gpt-realtime-whisper"
      ? "gpt-4o-transcribe"
      : settings.OPENAI_TRANSCRIBE_MODEL || "whisper-1";

  const openai = await openaiClient();

  // 只有 whisper-1 支援 verbose_json 的 segment 時間戳；逐字稿 UI 會用時間戳分行。
  if (configuredModel === "whisper-1") {
    const result = await openai.audio.transcriptions.create({
      file: createReadStream(path) as Uploadable,
      model: "whisper-1",
      response_format: "verbose_json",
      timestamp_granularities: ["segment"]
    });
    const text = formatTimestampedTranscript(result);
    if (!text) throw new Error("轉錄結果為空");
    return text;
  }

  // 其他模型（如 gpt-4o-transcribe）：取純文字逐字稿，無時間戳。
  const result = await openai.audio.transcriptions.create({
    file: createReadStream(path) as Uploadable,
    model: configuredModel
  });
  const text = (result as { text?: string }).text?.trim() || "";
  if (!text) throw new Error("轉錄結果為空");
  return text;
}
