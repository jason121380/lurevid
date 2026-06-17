import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openaiClient } from "@/lib/openai";
import { getAppSettings } from "@/lib/settings";
import { ffmpegPath } from "@/lib/ffmpeg";
import { describeDownloadError, isSupportedSourceUrl, normalizeSourceUrl } from "@/lib/transcribe";

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

export async function downloadSourceVideo(url: string) {
  if (!isSupportedSourceUrl(url)) throw new Error("不支援的來源影片連結");
  const normalizedUrl = normalizeSourceUrl(url);
  const dir = await mkdtemp(join(tmpdir(), "lurevid-video-"));
  const output = join(dir, "source.%(ext)s");
  try {
    await run("yt-dlp", [
      "-f",
      "bv*+ba/best",
      "--merge-output-format",
      "mp4",
      "--no-playlist",
      "--no-warnings",
      "--ffmpeg-location",
      ffmpegPath(),
      "-o",
      output,
      "--",
      normalizedUrl
    ]);
  } catch (error) {
    throw describeDownloadError(error);
  }

  const files = await readdir(dir);
  const video = files.find((file) => /^source\.(mp4|webm|mov|mkv|m4v)$/i.test(file));
  if (!video) throw new Error("yt-dlp 沒有輸出可分析的影片檔");
  return { dir, path: join(dir, video) };
}

export async function extractVideoFrames(videoPath: string, dir: string) {
  await run(ffmpegPath(), [
    "-y",
    "-i",
    videoPath,
    "-vf",
    "fps=1/3,scale=720:-1",
    "-frames:v",
    "8",
    join(dir, "frame-%02d.jpg")
  ]);

  const files = (await readdir(dir)).filter((file) => /^frame-\d+\.jpg$/i.test(file)).sort();
  return Promise.all(
    files.map(async (file) => {
      const bytes = await readFile(join(dir, file));
      return `data:image/jpeg;base64,${bytes.toString("base64")}`;
    })
  );
}

export async function analyzeVideoFrames(frames: string[], transcript: string, platform: string) {
  if (frames.length === 0) return "";

  const openai = await openaiClient();
  const settings = await getAppSettings();
  const model = settings.OPENAI_STORY_MODEL || "gpt-5.4-mini";
  const response = await openai.responses.create({
    model,
    input: [
      {
        role: "system",
        content:
          "你是短影音視覺分鏡分析師。你會同時看影片抽樣影格與逐字稿，分析畫面、字幕、鏡頭語言、節奏與分鏡手法。用繁體中文輸出，具體而精簡。"
      },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text:
              `平台：${platform}\n逐字稿：\n${transcript || "沒有逐字稿"}\n\n` +
              "請根據下列影片抽樣影格分析：畫面主體、場景/道具、字幕或畫面文字、鏡頭構圖、剪輯節奏、情緒氛圍、每段可能的分鏡功能，以及可借鑑的視覺策略。"
          },
          ...frames.map((imageUrl) => ({
            type: "input_image" as const,
            image_url: imageUrl,
            detail: "low" as const
          }))
        ]
      }
    ]
  });

  return response.output_text.trim();
}

export async function withDownloadedVideo<T>(url: string, callback: (videoPath: string, dir: string) => Promise<T>) {
  const downloaded = await downloadSourceVideo(url);
  try {
    return await callback(downloaded.path, downloaded.dir);
  } finally {
    await rm(downloaded.dir, { recursive: true, force: true });
  }
}
