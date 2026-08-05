import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getAppSettings } from "@/lib/settings";

/**
 * TikTok／IG Reels 的公開連結從機房 IP 常被要求登入或限流。
 * 管理員可在設定頁貼入 Netscape 格式的 cookies.txt，這裡把它寫成暫存檔交給 yt-dlp。
 *
 * cookie 內容等同於登入中的 session，因此：
 * 只寫進 0600 的暫存檔、用完即刪、任何情況都不寫進日誌或錯誤訊息。
 */
export async function withYtdlpCookies<T>(run: (extraArgs: string[]) => Promise<T>): Promise<T> {
  const cookies = (await getAppSettings()).YTDLP_COOKIES?.trim();
  if (!cookies) return run([]);

  const dir = await mkdtemp(join(tmpdir(), "lurevid-cookies-"));
  const path = join(dir, "cookies.txt");
  try {
    // yt-dlp 要求 Netscape 檔頭；貼上時漏掉是常見狀況，這裡補起來。
    const body = cookies.startsWith("# Netscape") ? cookies : `# Netscape HTTP Cookie File\n${cookies}`;
    await writeFile(path, `${body}\n`, { mode: 0o600 });
    return await run(["--cookies", path]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** 錯誤訊息要區分「還沒設 cookies」和「設了但還是失敗」，兩者的下一步完全不同。 */
export async function hasYtdlpCookies() {
  return Boolean((await getAppSettings()).YTDLP_COOKIES?.trim());
}
