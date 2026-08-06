import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openaiClient } from "@/lib/openai";
import { getAppSettings } from "@/lib/settings";
import { ffmpegPath } from "@/lib/ffmpeg";
import { downloadWithCobalt } from "@/lib/cobalt";
import { describeDownloadError, isSupportedSourceUrl, logDownloadFailure, normalizeSourceUrl } from "@/lib/transcribe";
import { hasYtdlpCookies, withYtdlpCookies } from "@/lib/ytdlp";

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

type SourceDownloadDeps = {
  cobalt: typeof downloadWithCobalt;
  ytdlp: (url: string, outputPattern: string) => Promise<void>;
};

async function downloadWithYtdlp(url: string, outputPattern: string) {
  await withYtdlpCookies((cookieArgs) =>
    run("yt-dlp", [
      "-f",
      "bv*+ba/best",
      "--merge-output-format",
      "mp4",
      "--no-playlist",
      "--no-warnings",
      ...cookieArgs,
      "--ffmpeg-location",
      ffmpegPath(),
      "-o",
      outputPattern,
      "--",
      url
    ])
  );
}

export function createSourceVideoDownloader(deps: SourceDownloadDeps) {
  return async (url: string) => {
    if (!isSupportedSourceUrl(url)) throw new Error("不支援的來源影片連結");
    const normalizedUrl = normalizeSourceUrl(url);
    const dir = await mkdtemp(join(tmpdir(), "lurevid-video-"));
    const cobaltOutput = join(dir, "source.mp4");
    const ytdlpOutput = join(dir, "source.%(ext)s");
    try {
      let cobaltSucceeded = false;
      try {
        cobaltSucceeded = await deps.cobalt(normalizedUrl, cobaltOutput);
      } catch (error) {
        console.error("[download:cobalt]", error instanceof Error ? error.message : "unknown error");
      }

      if (!cobaltSucceeded) await deps.ytdlp(normalizedUrl, ytdlpOutput);

      const files = await readdir(dir);
      const video = files.find((file) => /^source\.(mp4|webm|mov|mkv|m4v)$/i.test(file));
      if (!video) throw new Error("yt-dlp 沒有輸出可分析的影片檔");
      return { dir, path: join(dir, video) };
    } catch (error) {
      await rm(dir, { recursive: true, force: true });
      logDownloadFailure("video", error);
      throw describeDownloadError(error, { hasCookies: await hasYtdlpCookies() });
    }
  };
}

export const downloadSourceVideo = createSourceVideoDownloader({
  cobalt: downloadWithCobalt,
  ytdlp: downloadWithYtdlp
});

export const FRAME_COUNT = 8;

/**
 * 用 ffmpeg 自己的輸出讀片長（`ffmpeg -i` 會把 Duration 印在 stderr）。
 * 這樣不必多帶一個 ffprobe 執行檔。讀不到時回 0，由呼叫端退回固定間隔。
 */
function probeDurationSeconds(videoPath: string) {
  return new Promise<number>((resolvePromise) => {
    const child = spawn(ffmpegPath(), ["-i", videoPath]);
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", () => resolvePromise(0));
    // 沒有指定輸出檔時 ffmpeg 一定以非零結束，這裡只要 stderr。
    child.on("close", () => {
      const match = stderr.match(/Duration:\s*(\d+):(\d{2}):(\d{2})(?:\.(\d+))?/);
      if (!match) return resolvePromise(0);
      const [, h, m, s, frac] = match;
      const seconds = Number(h) * 3600 + Number(m) * 60 + Number(s) + Number(`0.${frac || 0}`);
      resolvePromise(Number.isFinite(seconds) && seconds > 0 ? seconds : 0);
    });
  });
}

/**
 * 平均取樣整支影片，而不是只看開頭。
 * 舊版固定 fps=1/3 取 8 張，等於永遠只分析前 24 秒——
 * 對 90 秒的 Reels 就已經失真，上傳的長片更是完全錯誤。
 * 回傳 durationSec 讓前端能標出每張影格真正的時間點。
 */
export async function extractVideoFrames(videoPath: string, dir: string) {
  const durationSec = await probeDurationSeconds(videoPath);
  // 讀不到片長時退回原本的固定間隔，至少還能取到開頭幾張。
  const fpsFilter = durationSec > 0 ? `fps=${FRAME_COUNT}/${durationSec.toFixed(3)}` : "fps=1/3";

  await run(ffmpegPath(), [
    "-y",
    "-i",
    videoPath,
    "-vf",
    `${fpsFilter},scale=720:-1`,
    "-frames:v",
    String(FRAME_COUNT),
    join(dir, "frame-%02d.jpg")
  ]);

  const files = (await readdir(dir)).filter((file) => /^frame-\d+\.jpg$/i.test(file)).sort();
  const frames = await Promise.all(
    files.map(async (file) => {
      const bytes = await readFile(join(dir, file));
      return `data:image/jpeg;base64,${bytes.toString("base64")}`;
    })
  );
  return { frames, durationSec };
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
