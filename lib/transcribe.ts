import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openaiClient } from "@/lib/openai";
import { getAppSettings } from "@/lib/settings";

export function detectPlatform(url: string) {
  if (/tiktok\.com/i.test(url)) return "TikTok";
  if (/instagram\.com/i.test(url)) return "Instagram";
  return "Unknown";
}

export function isSupportedSourceUrl(url: string) {
  return /^https?:\/\/.+/i.test(url) && detectPlatform(url) !== "Unknown";
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

/**
 * 用 yt-dlp 下載影片音訊，再用 OpenAI 轉成逐字稿。
 * 優先下載原始音訊格式，避免本機分析階段依賴 ffmpeg。
 * 機房 IP 常被 IG/TikTok 阻擋，失敗時拋錯，呼叫端應退回「手動貼逐字稿」。
 */
export async function fetchTranscript(url: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "lurevid-"));
  try {
    await run("yt-dlp", [
      "-f",
      "bestaudio/best",
      "--no-playlist",
      "--no-warnings",
      "-o",
      join(dir, "source.%(ext)s"),
      url
    ]);

    const files = await readdir(dir);
    const audio = files.find((file) => TRANSCRIBABLE_EXTENSIONS.has(file.split(".").pop()?.toLowerCase() || ""));
    if (!audio) throw new Error("yt-dlp 沒有輸出可轉錄的音訊檔");

    return transcribeMediaFile(join(dir, audio));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function transcribeMediaFile(path: string): Promise<string> {
  const settings = await getAppSettings();
  const model =
    settings.OPENAI_TRANSCRIBE_MODEL === "gpt-realtime-whisper"
      ? "gpt-4o-transcribe"
      : settings.OPENAI_TRANSCRIBE_MODEL || "gpt-4o-transcribe";

  const result = await (await openaiClient()).audio.transcriptions.create({
    file: createReadStream(path) as any,
    model
  });

  const text = result.text?.trim();
  if (!text) throw new Error("轉錄結果為空");
  return text;
}
