import { createWriteStream } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

export function storageRoot() {
  return resolve(process.env.STORAGE_DIR || "./storage/generated");
}

export async function downloadVideo(url: string, path: string) {
  await mkdir(dirname(path), { recursive: true });
  const response = await fetch(url);
  if (!response.ok || !response.body) throw new Error(`下載影片失敗：${url}`);
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
  await run("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", finalPath]);
  return finalPath;
}
