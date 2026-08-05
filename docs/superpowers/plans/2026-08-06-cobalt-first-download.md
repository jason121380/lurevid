# Cobalt-first Download Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add YouTube source support and download YouTube, TikTok, and Instagram Reels through the private Cobalt service first, with the existing yt-dlp path as an automatic fallback.

**Architecture:** A focused `lib/cobalt.ts` client calls the configured internal Cobalt API with `alwaysProxy: true`, validates that the returned tunnel remains on the configured Cobalt origin, and streams a size-capped file to disk. `lib/visual.ts` orchestrates Cobalt-first and yt-dlp-second behavior without changing its public one-argument API. URL validation remains explicit and synchronized between the server and homepage.

**Tech Stack:** Next.js 15 App Router, TypeScript 6, Node fetch/streams, Vitest 4, yt-dlp, Cobalt API 11.

## Global Constraints

- User-facing copy and errors must remain Traditional Chinese.
- Support public YouTube videos, Shorts, and Live replay URLs; keep TikTok and Instagram Reels.
- Do not support Instagram Stories, Facebook Stories, or Facebook videos in this change.
- Cobalt is internal-only at `http://cobalt-api.zeabur.internal:9000/`; no browser-visible endpoint or key.
- `COBALT_API_URL` is optional. Missing configuration must preserve the existing yt-dlp behavior.
- Cobalt errors, source URLs, internal URLs, Prisma/Redis/OpenAI errors, and local paths must not reach users.
- Preserve the existing maximum download size and temporary-file cleanup.
- All new behavior follows test-driven development: failing test, observed failure, minimal implementation, passing test.

---

## File Map

- Create `lib/cobalt.ts`: Cobalt request, response validation, tunnel-origin enforcement, and capped file streaming.
- Create `tests/cobalt.test.ts`: unit coverage for the Cobalt client.
- Create `tests/source-download.test.ts`: Cobalt-first/fallback orchestration coverage.
- Modify `lib/visual.ts`: extract yt-dlp download into an injectable unit and orchestrate fallback.
- Modify `lib/transcribe.ts`: explicit YouTube URL allowlist and platform detection.
- Modify `tests/source-url.test.ts`: YouTube allowlist and rejection coverage.
- Modify `app/page.tsx`: mirror the server allowlist and update copy.
- Modify `app/api/projects/route.ts`: update validation copy.
- Modify `.env.example`, `README.md`, `CLAUDE.md`, `AGENTS.md`: document optional Cobalt deployment and fallback behavior.

---

### Task 1: Add explicit YouTube URL support

**Files:**
- Modify: `tests/source-url.test.ts`
- Modify: `lib/transcribe.ts:12-62`
- Modify: `app/page.tsx:9-43`
- Modify: `app/api/projects/route.ts:12-60`

**Interfaces:**
- Produces: `isSupportedSourceUrl(url: string): boolean`
- Produces: `detectPlatform(url: string): "YouTube" | "TikTok" | "Instagram" | "Unknown"`
- Produces: `normalizeSourceUrl(url: string): string`

- [ ] **Step 1: Replace the obsolete YouTube rejection test with failing acceptance and narrow-rejection tests**

```ts
it("accepts supported YouTube single-video URLs", () => {
  for (const url of [
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://youtu.be/dQw4w9WgXcQ",
    "https://www.youtube.com/shorts/abc123XYZ",
    "https://m.youtube.com/live/abc123XYZ"
  ]) {
    expect(isSupportedSourceUrl(url)).toBe(true);
    expect(detectPlatform(url)).toBe("YouTube");
  }
});

it("rejects YouTube pages that are not one video", () => {
  for (const url of [
    "https://www.youtube.com/",
    "https://www.youtube.com/@openai",
    "https://www.youtube.com/playlist?list=PL123",
    "https://youtu.be/"
  ]) {
    expect(isSupportedSourceUrl(url)).toBe(false);
  }
});
```

- [ ] **Step 2: Run the focused test and observe the expected failure**

Run: `npm test -- tests/source-url.test.ts`

Expected: the supported YouTube cases fail because the current allowlist returns `false` and `Unknown`.

- [ ] **Step 3: Implement narrow host/path matching in the server allowlist**

Use platform entries with a path predicate so YouTube `watch` additionally requires a non-empty `v` query, while `/shorts/<id>`, `/live/<id>`, and `youtu.be/<id>` require a non-empty first path segment. Keep exact/subdomain host matching and HTTP(S)-only parsing.

```ts
type Platform = {
  name: "YouTube" | "TikTok" | "Instagram";
  hosts: string[];
  accepts: (url: URL) => boolean;
};

const hasPathId = (parsed: URL, prefix: RegExp) => prefix.test(parsed.pathname);

const PLATFORMS: Platform[] = [
  {
    name: "YouTube",
    hosts: ["youtube.com"],
    accepts: (parsed) =>
      (parsed.pathname === "/watch" && Boolean(parsed.searchParams.get("v"))) ||
      hasPathId(parsed, /^\/(shorts|live)\/[^/]+/i)
  },
  { name: "YouTube", hosts: ["youtu.be"], accepts: (parsed) => /^\/[^/]+/.test(parsed.pathname) },
  { name: "TikTok", hosts: ["tiktok.com"], accepts: () => true },
  { name: "Instagram", hosts: ["instagram.com"], accepts: (parsed) => /^\/reels?\/[^/]+/i.test(parsed.pathname) }
];
```

- [ ] **Step 4: Mirror the same rules and update Traditional Chinese copy on the homepage and API**

Update `isSupportedVideoUrl` in `app/page.tsx` with the same exact host/path/query rules. Change both validation messages to:

```text
目前只接受 YouTube、TikTok 或 IG Reels 連結
```

Change the Zod fallback message in `app/api/projects/route.ts` to:

```text
請貼上有效的 YouTube、TikTok 或 IG Reels 連結
```

- [ ] **Step 5: Run focused and full URL tests**

Run: `npm test -- tests/source-url.test.ts tests/settings-and-schemas.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit URL support**

```bash
git add tests/source-url.test.ts lib/transcribe.ts app/page.tsx app/api/projects/route.ts
git commit -m "Support YouTube source URLs"
```

---

### Task 2: Build the private Cobalt client

**Files:**
- Create: `tests/cobalt.test.ts`
- Create: `lib/cobalt.ts`

**Interfaces:**
- Produces: `downloadWithCobalt(sourceUrl: string, outputPath: string, options?: CobaltDownloadOptions): Promise<boolean>`
- `false` means `COBALT_API_URL` is absent; a configured service failure throws so the caller can log and fall back.
- `CobaltDownloadOptions` permits `apiUrl`, `fetchImpl`, and `maxBytes` injection for deterministic tests; production defaults use `process.env.COBALT_API_URL`, global `fetch`, and `DEFAULT_MAX_DOWNLOAD_BYTES`.

- [ ] **Step 1: Write failing tests for disabled configuration and a successful tunnel download**

```ts
it("returns false without a configured Cobalt URL", async () => {
  expect(await downloadWithCobalt("https://youtu.be/demo", outputPath, { apiUrl: "" })).toBe(false);
});

it("requests an always-proxied MP4 and writes the tunnel body", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, init });
    if (calls.length === 1) {
      return Response.json({
        status: "tunnel",
        url: "http://cobalt-api.zeabur.internal:9000/tunnel?id=one",
        filename: "source.mp4"
      });
    }
    return new Response("video-bytes", { status: 200, headers: { "content-length": "11" } });
  };

  await expect(downloadWithCobalt("https://youtu.be/demo", outputPath, {
    apiUrl: "http://cobalt-api.zeabur.internal:9000/",
    fetchImpl
  })).resolves.toBe(true);
  expect(JSON.parse(String(calls[0].init?.body))).toMatchObject({
    url: "https://youtu.be/demo",
    alwaysProxy: true,
    videoQuality: "1080",
    youtubeVideoContainer: "mp4"
  });
  expect(await readFile(outputPath, "utf8")).toBe("video-bytes");
});
```

- [ ] **Step 2: Run tests and observe the missing-module failure**

Run: `npm test -- tests/cobalt.test.ts`

Expected: FAIL because `@/lib/cobalt` does not exist.

- [ ] **Step 3: Implement configuration parsing and the Cobalt POST request**

```ts
export type CobaltDownloadOptions = {
  apiUrl?: string;
  fetchImpl?: typeof fetch;
  maxBytes?: number;
};

export async function downloadWithCobalt(sourceUrl: string, outputPath: string, options: CobaltDownloadOptions = {}) {
  const rawApiUrl = options.apiUrl ?? process.env.COBALT_API_URL ?? "";
  if (!rawApiUrl.trim()) return false;
  const apiUrl = new URL(rawApiUrl);
  if (apiUrl.protocol !== "http:" && apiUrl.protocol !== "https:") throw new Error("Cobalt 設定無效");

  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(apiUrl, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      url: sourceUrl,
      downloadMode: "auto",
      alwaysProxy: true,
      videoQuality: "1080",
      youtubeVideoCodec: "h264",
      youtubeVideoContainer: "mp4"
    }),
    signal: AbortSignal.timeout(30_000)
  });
  if (!response.ok) throw new Error("Cobalt API 無法使用");
  const result = await response.json() as { status?: string; url?: string };
  if (result.status !== "tunnel" || !result.url) throw new Error("Cobalt 無法提供單一影片");
  const tunnelUrl = new URL(result.url);
  if (tunnelUrl.origin !== apiUrl.origin) throw new Error("Cobalt 回傳不安全的下載位置");
  const tunnel = await fetchImpl(tunnelUrl, { redirect: "error", signal: AbortSignal.timeout(30_000) });
  if (!tunnel.ok || !tunnel.body) throw new Error("Cobalt 影片串流無法使用");
  await writeFile(outputPath, Buffer.from(await tunnel.arrayBuffer()));
  return true;
}
```

- [ ] **Step 4: Add failing security and size-limit tests**

Cover each behavior in a separate test:

```ts
it.each(["redirect", "picker", "local-processing", "error"])(
  "rejects unsupported Cobalt status %s",
  async (status) => {
    const fetchImpl: typeof fetch = async () => Response.json({
      status,
      url: "https://cdn.example/video.mp4"
    });
    await expect(downloadWithCobalt("https://youtu.be/demo", outputPath, {
      apiUrl: "http://cobalt-api.zeabur.internal:9000/",
      fetchImpl
    })).rejects.toThrow("Cobalt");
  }
);

it("rejects a tunnel outside the configured Cobalt origin", async () => {
  // API response URL is http://169.254.169.254/latest/meta-data and must reject before a second fetch.
});

it("rejects a declared content length over the limit", async () => {
  // Tunnel response has content-length maxBytes + 1 and must reject without writing a successful file.
});

it("aborts streaming after the accumulated bytes exceed the limit", async () => {
  // No content-length; stream two chunks whose total exceeds maxBytes and expect rejection.
});
```

- [ ] **Step 5: Run the tests and observe each missing validation failure**

Run: `npm test -- tests/cobalt.test.ts`

Expected: the new security and size tests fail because response validation and capped streaming are not complete.

- [ ] **Step 6: Implement tunnel-origin validation and capped streaming**

The implementation must:

```ts
const tunnelUrl = new URL(result.url);
if (tunnelUrl.origin !== apiUrl.origin) throw new Error("Cobalt 回傳不安全的下載位置");
if (result.status !== "tunnel") throw new Error("Cobalt 無法提供單一影片");
```

Fetch the tunnel with the injected fetch function, use `redirect: "error"`, reject non-2xx/empty bodies, check `content-length`, then pipe `Readable.fromWeb(response.body)` through a `Transform` byte counter into `createWriteStream(outputPath)`. On any error, remove the partial output with `rm(outputPath, { force: true })` before rethrowing.

- [ ] **Step 7: Run Cobalt tests and typecheck**

Run: `npm test -- tests/cobalt.test.ts && npm run typecheck`

Expected: PASS with no warnings or TypeScript errors.

- [ ] **Step 8: Commit the Cobalt client**

```bash
git add lib/cobalt.ts tests/cobalt.test.ts
git commit -m "Add private Cobalt download client"
```

---

### Task 3: Orchestrate Cobalt-first with yt-dlp fallback

**Files:**
- Create: `tests/source-download.test.ts`
- Modify: `lib/visual.ts:1-59`

**Interfaces:**
- Consumes: `downloadWithCobalt(sourceUrl, outputPath): Promise<boolean>`
- Preserves: `downloadSourceVideo(url: string): Promise<{ dir: string; path: string }>`
- Adds test-only optional dependency boundary: `downloadSourceVideo(url: string, deps?: Partial<SourceDownloadDeps>)`

- [ ] **Step 1: Write failing orchestration tests through injected real functions**

```ts
it("uses Cobalt first and skips yt-dlp when Cobalt succeeds", async () => {
  const events: string[] = [];
  const result = await downloadSourceVideo(YOUTUBE_URL, {
    cobalt: async (_url, outputPath) => {
      events.push("cobalt");
      await writeFile(outputPath, "video");
      return true;
    },
    ytdlp: async () => events.push("ytdlp")
  });
  expect(events).toEqual(["cobalt"]);
  await rm(result.dir, { recursive: true, force: true });
});

it("falls back to yt-dlp when Cobalt is disabled or throws", async () => {
  for (const cobalt of [async () => false, async () => { throw new Error("offline"); }]) {
    const events: string[] = [];
    const result = await downloadSourceVideo(YOUTUBE_URL, {
      cobalt,
      ytdlp: async (url, outputPattern) => {
        events.push(`ytdlp:${url}`);
        await writeFile(outputPattern.replace("%(ext)s", "mp4"), "fallback-video");
      }
    });
    expect(events).toContain(`ytdlp:${YOUTUBE_URL}`);
    await rm(result.dir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run tests and observe the signature/behavior failure**

Run: `npm test -- tests/source-download.test.ts`

Expected: FAIL because `downloadSourceVideo` does not accept injected dependencies and always invokes yt-dlp.

- [ ] **Step 3: Extract the existing yt-dlp block and implement fallback**

Define:

```ts
type SourceDownloadDeps = {
  cobalt: typeof downloadWithCobalt;
  ytdlp: (url: string, outputPattern: string) => Promise<void>;
};
```

The production defaults call `downloadWithCobalt` and the exact existing `withYtdlpCookies`/`spawn` logic. Use a fixed Cobalt target `join(dir, "source.mp4")`; retain the current yt-dlp pattern `join(dir, "source.%(ext)s")`.

The decision logic is:

```ts
let cobaltSucceeded = false;
try {
  cobaltSucceeded = await deps.cobalt(normalizedUrl, cobaltOutput);
} catch (error) {
  console.error("[download:cobalt]", error instanceof Error ? error.message : "unknown error");
}
if (!cobaltSucceeded) await deps.ytdlp(normalizedUrl, ytdlpOutput);
```

Do not pass a Cobalt failure into `describeDownloadError`; only the final yt-dlp failure becomes user-facing. Preserve directory cleanup on every failure.

- [ ] **Step 4: Add a failing test for cleanup after both downloaders fail**

Capture the temporary directory path from the yt-dlp output pattern, throw from yt-dlp, and assert `access(dir)` rejects after `downloadSourceVideo` rejects.

- [ ] **Step 5: Run the cleanup test and confirm its expected failure if cleanup is missing**

Run: `npm test -- tests/source-download.test.ts`

Expected: FAIL until the catch path removes the temporary directory.

- [ ] **Step 6: Complete cleanup and friendly final error behavior**

Wrap the orchestration and file discovery in `try/catch`; on error, remove the temporary directory, log the yt-dlp error through `logDownloadFailure("video", error)`, and throw `describeDownloadError(error, { hasCookies: await hasYtdlpCookies() })`.

- [ ] **Step 7: Run focused and full tests**

Run: `npm test -- tests/source-download.test.ts tests/cobalt.test.ts tests/source-url.test.ts`

Expected: PASS.

Run: `npm test`

Expected: all existing and new tests PASS.

- [ ] **Step 8: Commit fallback integration**

```bash
git add lib/visual.ts tests/source-download.test.ts
git commit -m "Prefer Cobalt with yt-dlp fallback"
```

---

### Task 4: Document configuration and verify the application

**Files:**
- Modify: `.env.example`
- Modify: `README.md`
- Modify: `CLAUDE.md`
- Modify: `AGENTS.md`

**Interfaces:**
- Documents: `COBALT_API_URL=http://cobalt-api.zeabur.internal:9000/`
- Preserves: `YTDLP_COOKIES` as the optional fallback credential.

- [ ] **Step 1: Add the optional environment variable and deployment explanation**

Add this commented example near source-download settings in `.env.example`:

```env
# 選填：同一個 Zeabur Project 內的自架 Cobalt；失敗時自動回退 yt-dlp
COBALT_API_URL="http://cobalt-api.zeabur.internal:9000/"
```

Update README, CLAUDE.md, and AGENTS.md consistently:

```text
來源下載順序為自架 Cobalt（有設定時）→ yt-dlp + 選填 cookies → 直接上傳提示。
Cobalt 只需設定在 Worker；Web 不需要 COBALT_API_URL。
YouTube 支援公開影片、Shorts 與 Live replay；Stories 仍不支援。
```

- [ ] **Step 2: Check documentation consistency and placeholders**

Run:

```bash
rg -n "只.*TikTok|TikTok.*IG Reels|YouTube|COBALT_API_URL|Stories" README.md CLAUDE.md AGENTS.md .env.example app/page.tsx app/api/projects/route.ts
```

Expected: no statement claims YouTube is unsupported; Stories remain explicitly unsupported; Worker-only Cobalt configuration is consistent.

- [ ] **Step 3: Run final static and automated verification**

Run: `npm run typecheck`

Expected: exit 0.

Run: `npm test`

Expected: all tests PASS.

Run: `NEXTAUTH_SECRET=test-build-secret npm run build`

Expected: Prisma generation and Next.js production build complete with exit 0.

- [ ] **Step 4: Review the final diff for secrets and accidental scope expansion**

Run:

```bash
git diff --check
git diff --stat origin/main...HEAD
git status --short
```

Expected: no whitespace errors, no API keys/cookies, and changes limited to Cobalt download, YouTube allowlisting, tests, and documentation.

- [ ] **Step 5: Commit documentation and verification-ready state**

```bash
git add .env.example README.md CLAUDE.md AGENTS.md
git commit -m "Document Cobalt download fallback"
```

---

## Deployment Handoff

After the implementation commits are pushed, add this only to the Zeabur `lurevid` Worker service:

```env
COBALT_API_URL=http://cobalt-api.zeabur.internal:9000/
```

Redeploy Worker and Web from the same new commit. Validate one public YouTube video, one TikTok video, one Instagram Reel, and one direct upload. Check Worker logs to confirm Cobalt success or a clean yt-dlp fallback without exposing raw errors in the UI.
