import { readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ settings: {} as Record<string, string> }));

vi.mock("@/lib/settings", () => ({
  getAppSettings: vi.fn(async () => mocks.settings)
}));

import { withYtdlpCookies } from "@/lib/ytdlp";

const COOKIE_LINE = ".facebook.com\tTRUE\t/\tTRUE\t0\tc_user\t1234567890";

beforeEach(() => {
  mocks.settings = {};
});

describe("yt-dlp cookies", () => {
  it("passes no extra arguments when nothing is configured", async () => {
    await expect(withYtdlpCookies(async (args) => args)).resolves.toEqual([]);
  });

  it("passes --cookies pointing at a real file when configured", async () => {
    mocks.settings = { YTDLP_COOKIES: COOKIE_LINE };
    const seen = await withYtdlpCookies(async (args) => {
      expect(args[0]).toBe("--cookies");
      const body = await readFile(args[1], "utf8");
      return { path: args[1], body, mode: (await stat(args[1])).mode & 0o777 };
    });
    expect(seen.body).toContain(COOKIE_LINE);
    expect(seen.mode).toBe(0o600);
  });

  it("adds the Netscape header yt-dlp requires when it is missing", async () => {
    mocks.settings = { YTDLP_COOKIES: COOKIE_LINE };
    const body = await withYtdlpCookies(async (args) => readFile(args[1], "utf8"));
    expect(body.startsWith("# Netscape HTTP Cookie File")).toBe(true);
  });

  it("does not double up a header that is already there", async () => {
    mocks.settings = { YTDLP_COOKIES: `# Netscape HTTP Cookie File\n${COOKIE_LINE}` };
    const body = await withYtdlpCookies(async (args) => readFile(args[1], "utf8"));
    expect(body.match(/# Netscape/g)).toHaveLength(1);
  });

  it("removes the file afterwards so session cookies do not linger", async () => {
    mocks.settings = { YTDLP_COOKIES: COOKIE_LINE };
    const path = await withYtdlpCookies(async (args) => args[1]);
    expect(existsSync(path)).toBe(false);
  });

  it("removes the file even when the download throws", async () => {
    mocks.settings = { YTDLP_COOKIES: COOKIE_LINE };
    let path = "";
    await expect(
      withYtdlpCookies(async (args) => {
        path = args[1];
        throw new Error("yt-dlp 失敗");
      })
    ).rejects.toThrow("yt-dlp 失敗");
    expect(path).not.toBe("");
    expect(existsSync(path)).toBe(false);
  });

  it("treats a blank setting as unset", async () => {
    mocks.settings = { YTDLP_COOKIES: "   " };
    await expect(withYtdlpCookies(async (args) => args)).resolves.toEqual([]);
  });
});
