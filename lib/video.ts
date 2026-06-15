import { createWriteStream } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { ffmpegPath } from "@/lib/ffmpeg";
import { assertSafeRemoteUrl } from "@/lib/safe-fetch";

export function storageRoot() {
  return resolve(process.env.STORAGE_DIR || "./storage/generated");
}

export async function downloadVideo(url: string, path: string) {
  await assertSafeRemoteUrl(url);
  await mkdir(dirname(path), { recursive: true });
  const response = await fetch(url);
  if (!response.ok || !response.body) throw new Error("下載影片片段失敗");
  await pipeline(Readable.fromWeb(response.body as any), createWriteStream(path));
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
  await writeFile(listPath, clipPaths.map((path) => `file '${path.replaceAll("'", "'\\''")}'`).join("\n"));
  // 重新編碼而非 -c copy：Seedance 片段的 codec/fps/解析度可能略有差異，stream copy 會合成失敗。
  await run(ffmpegPath(), [
    "-y",
    "-f",
    "concat",
    "-safe",
    "0",
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
