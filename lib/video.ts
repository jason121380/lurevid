import { createWriteStream } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { Readable, Transform } from "node:stream";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { pipeline } from "node:stream/promises";
import { ffmpegPath } from "@/lib/ffmpeg";
import { DEFAULT_MAX_DOWNLOAD_BYTES, safeFetch } from "@/lib/safe-fetch";

export function storageRoot() {
  return resolve(process.env.STORAGE_DIR || "./storage/generated");
}

export async function downloadVideo(url: string, path: string) {
  await mkdir(dirname(path), { recursive: true });
  const response = await safeFetch(url, { maxBytes: DEFAULT_MAX_DOWNLOAD_BYTES });
  if (!response.ok || !response.body) throw new Error("下載影片片段失敗");
  let downloaded = 0;
  const limiter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      downloaded += chunk.length;
      if (downloaded > DEFAULT_MAX_DOWNLOAD_BYTES) {
        callback(new Error("下載檔案超過大小限制"));
        return;
      }
      callback(null, chunk);
    }
  });
  await pipeline(Readable.fromWeb(response.body as unknown as NodeReadableStream<Uint8Array>), limiter, createWriteStream(path));
}

function run(command: string, args: string[]) {
  return new Promise<void>((resolvePromise, reject) => {
    const child = spawn(command, args);
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("close", (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(stderr || `${command} exited with ${code}`));
    });
  });
}

export async function mergeVideos(projectId: string, clipPaths: string[]) {
  const projectDir = join(storageRoot(), projectId);
  await mkdir(projectDir, { recursive: true });
  const listPath = join(projectDir, "concat.txt");
  const finalPath = join(projectDir, "final.mp4");
  await writeFile(listPath, clipPaths.map((path) => `file '${basename(path).replaceAll("'", "'\\''")}'`).join("\n"));
  // 重新編碼而非 -c copy：Seedance 片段的 codec/fps/解析度可能略有差異，stream copy 會合成失敗。
  await run(ffmpegPath(), [
    "-y",
    "-f",
    "concat",
    "-i",
    listPath,
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "20",
    "-pix_fmt",
    "yuv420p",
    "-r",
    "30",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-movflags",
    "+faststart",
    finalPath
  ]);
  return finalPath;
}
