import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Uploadable } from "openai";
import { openaiClient } from "@/lib/openai";
import { ffmpegPath } from "@/lib/ffmpeg";
import { getAppSettings } from "@/lib/settings";
import { hasYtdlpCookies, withYtdlpCookies } from "@/lib/ytdlp";

/**
 * 來源平台白名單。刻意維持狹窄：每個平台都要明確列出網域與允許的路徑，
 * 新增平台時只改這張表（外加 app/page.tsx 的前端對應檢查）。
 * paths 為 null 代表該網域不限路徑。
 */
const PLATFORMS: Array<{ name: string; hosts: string[]; paths: RegExp[] | null }> = [
  { name: "TikTok", hosts: ["tiktok.com"], paths: null },
  // IG 只開放 Reels；限時動態要登入、留言/貼文頁不是影片，都不在範圍內。
  { name: "Instagram", hosts: ["instagram.com"], paths: [/^\/reels?\//i] }
];

function matchPlatform(parsed: URL) {
  const host = parsed.hostname.toLowerCase();
  const platform = PLATFORMS.find((entry) =>
    entry.hosts.some((base) => host === base || host.endsWith(`.${base}`))
  );
  if (!platform) return null;
  if (platform.paths && !platform.paths.some((pattern) => pattern.test(parsed.pathname))) return null;
  return platform;
}

function parseAllowedUrl(url: string): URL | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  return matchPlatform(parsed) ? parsed : null;
}

export function detectPlatform(url: string) {
  const parsed = parseAllowedUrl(url);
  if (!parsed) return "Unknown";
  return matchPlatform(parsed)?.name || "Unknown";
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
 * yt-dlp 的原文只能進伺服器日誌：裡面有 stderr、影片 ID 與網址。
 * 沒有這行的話，下載失敗時完全查不出原因（平台改版？IP 被擋？要登入？）。
 */
export function logDownloadFailure(scope: string, error: unknown) {
  console.error(`[download:${scope}]`, error instanceof Error ? error.message : error);
}

/**
 * 把 yt-dlp／下載失敗的原始錯誤轉成乾淨的使用者訊息，
 * 不外洩原始 stderr、影片 ID 或網址（符合專案的錯誤訊息規範）。
 */
export function describeDownloadError(error: unknown, options?: { hasCookies?: boolean }): Error {
  const text = (error instanceof Error ? error.message : String(error || "")).toLowerCase();

  // 需要登入／被判定為機器人：填 cookies 通常能解，但已經填了就別再叫人填一次。
  if (/not a bot|cookies-from-browser|confirm you|consent|login|sign in|private|verification|captcha|robot|forbidden|403/.test(text)) {
    return new Error(
      options?.hasCookies
        ? "來源平台要求登入驗證，但目前的 cookies 沒有通過（可能已過期）。請重新匯出一份，或把影片下載到本機後改用「上傳影片」。"
        : "此影片需要登入或被來源平台阻擋。可在設定頁填入 yt-dlp cookies，或把影片下載到本機後改用「上傳影片」。"
    );
  }
  if (/rehydration|unable to extract|extractor|unable to download webpage/.test(text)) {
    return new Error("來源平台暫時無法下載（可能是平台改版或此伺服器 IP 被限制）。請稍後再試，或把影片下載到本機後改用「上傳影片」。");
  }
  if (/429|too many requests|rate.?limit/.test(text)) {
    return new Error("來源平台暫時限流（429）。請稍後再試，或把影片下載到本機後改用「上傳影片」。");
  }
  return new Error("影片下載失敗。請確認連結有效且為公開影片，稍後再試，或把影片下載到本機後改用「上傳影片」。");
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
      await withYtdlpCookies((cookieArgs) =>
        run("yt-dlp", [
          "-f",
          "bestaudio/best",
          "--no-playlist",
          "--no-warnings",
          ...cookieArgs,
          "--ffmpeg-location",
          ffmpegPath(),
          "-o",
          join(dir, "source.%(ext)s"),
          "--",
          normalizedUrl
        ])
      );
    } catch (error) {
      logDownloadFailure("audio", error);
      throw describeDownloadError(error, { hasCookies: await hasYtdlpCookies() });
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
