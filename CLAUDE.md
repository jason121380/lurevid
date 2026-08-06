# CLAUDE.md

## Project

`lurevid` 是用於分析與改編公開 YouTube 影片、Shorts、Live replay、TikTok 與 Instagram Reels（或直接上傳影片檔）的 Next.js + TypeScript 應用程式；Facebook 與 Instagram Stories 仍不支援。

The expected user experience:

1. 使用者貼上公開 YouTube（影片／Shorts／Live replay）、TikTok 或 Instagram Reels URL，或上傳影片檔。
2. App 建立專案。
3. Worker 依序以自架 Cobalt（有設定時）→ yt-dlp + 選填 cookies → 直接上傳提示處理來源下載，再抽取視覺影格、轉錄音訊並執行 AI 分析。
4. 使用者檢閱／編輯分析、結構與改編腳本。
5. App 產生 9 格分鏡場景與圖片，合併成一張 3x3 參考圖，再送至 Seedance 一次以產生最終影片。

## Important Behavior

Analysis must include video visuals, not only transcript text.

The worker should analyze:

- Transcript / spoken content
- Extracted video frames
- On-screen captions or text
- Shot composition
- Visual pacing and editing rhythm
- Scene function in the short-video structure

When the muxed download fails, the worker falls back to an audio-only yt-dlp download for transcription (`runFull` in `scripts/worker.ts`); if both fail, the project is marked failed with a friendly message.

## Quick Studio

- `/quick/image` and `/quick/video` are one-shot generations, separate from the eight-step project flow. Each card is a `Generation` row so results survive a reload.
- They run on their own BullMQ queue (`QUICK_QUEUE_NAME`, `QUICK_CONCURRENCY`, default 3) with its own worker in `scripts/worker.ts`; project-job failure handling does not apply to them.
- `enhancePrompt` only fills in the prompt and hands it back — the user confirms or reverts before anything is generated. Never generate straight from the enhanced text.
- `generateImageFromPrompt` deliberately does not inject the "East Asian (Taiwanese)" line that `generateStoryboardImage` adds; that exists for storyboard continuity and must not rewrite a user's own prompt.
- Worker errors are passed through `friendlyGenerationError`: only messages we authored (Traditional Chinese) reach the user, everything else becomes a generic line so hostnames and internal paths stay in the log.
- The model shown on each page comes from `/api/quick/config`, so the badge always matches the configured model rather than a hardcoded name.

## Mail

- Two transports behind `sendMail` in `lib/mailer.ts`, chosen by `MAIL_PROVIDER`.
- `zeabur` (default) POSTs to the fixed `https://api.zeabur.com/api/v1/zsend/emails` with a `Bearer` key. **Zeabur's own infrastructure blocks outbound SMTP ports**, so SMTP does not work from a Zeabur deployment — use this one there. Its `from` must be a bare address, so `MAIL_FROM` is reduced with `bareAddress()`; the sending domain needs DKIM/SPF/DMARC verified in Zeabur Email first.
- `smtp` uses nodemailer for self-hosting or any host that permits SMTP.
- The endpoint is a hardcoded constant, not a setting, to keep it out of SSRF reach.
- Send failures must never change the response `/api/auth/forgot-password` returns; log them instead.

## Platforms & Downloads

- 支援來源集中在 `lib/source-url.ts` 的 `PLATFORMS` 表（allowlist + `new URL` 驗證）：公開 YouTube 影片、Shorts、Live replay、TikTok 與 Instagram（僅 `/reel(s)/`）。Facebook 與 Instagram Stories 仍不支援。allowlist 維持嚴格；新增平台時要一併更新該表與 `app/page.tsx` 的鏡像檢查。
- 來源下載順序為自架 Cobalt（有設定時）→ yt-dlp + 選填 cookies → 直接上傳提示。`COBALT_API_URL=http://cobalt-api.zeabur.internal:9000/` 只設定在 Worker；Web 不需要這個變數。
- `YTDLP_COOKIES` (Netscape cookies.txt, optional admin setting) is passed to yt-dlp via `withYtdlpCookies` in `lib/ytdlp.ts` for when a datacenter IP gets a login wall. It is a session credential: written to a 0600 temp file, deleted after every download, never logged. `describeDownloadError` distinguishes "no cookies set" from "cookies set but rejected" so it never asks for what is already there.
- yt-dlp's own failure text goes to the worker log via `logDownloadFailure`; users only ever see the translated message.
- 使用者也可直接上傳影片檔（`app/api/projects/upload/route.ts`，接受不超過 `DEFAULT_MAX_DOWNLOAD_BYTES` 的 MP4／MOV／WebM）。上傳檔略過 Cobalt 與 yt-dlp，Worker 直接在原處分析；上傳只適用第一次分析，重新分析時需重新上傳。
- yt-dlp is installed in the Docker image from the **nightly** channel by default (`YTDLP_CHANNEL=nightly|stable|<tag>`); platforms change often and nightly tracks extractor fixes.
- The worker self-updates yt-dlp to the latest nightly on startup (best-effort, non-fatal, in `scripts/worker.ts`). Disable with `YTDLP_AUTO_UPDATE=0` when the deploy network can't reach GitHub. This keeps extractors current between image rebuilds.
- Download failures surface a friendly Traditional Chinese message via `describeDownloadError` (`lib/transcribe.ts`); raw yt-dlp stderr / video ids / URLs are never shown to users.
- Datacenter IPs (e.g. Zeabur) are frequently rate-limited/blocked by the source platform (HTTP 429). That is IP blocking, not a code bug; a proxy/cookies or a more reachable network is the workaround.

## Monitoring

- `/health` (admin-only page) shows status of PostgreSQL, Redis, the worker, the job queue, and OpenAI/Seedance/R2 configuration. Auto-refreshes; has a "clear failed records" action.
- The worker writes a Redis heartbeat (`WORKER_HEARTBEAT_KEY` in `lib/queue.ts`, EX 60) every 15s so `/api/health/status` can detect worker liveness.
- Jobs are enqueued with `removeOnComplete` + `removeOnFail: 50` so failed/completed records don't accumulate.

## Authentication

This is a public multi-user app. All pages and API routes require login (NextAuth, Credentials + JWT).

- Each `Project` is owned by a `User` (`Project.userId`); every project API checks ownership.
- `/settings` and `/api/settings` are admin-only. Admins are listed in `ADMIN_EMAILS` (comma-separated).
- `middleware.ts` protects page routes (redirect to `/login`); API routes self-check via `lib/authz.ts` and return JSON 401/403.
- Forgot password: `/forgot-password` issues a single-use, 60-minute token (`PasswordResetToken`; only a SHA-256 hash is stored) and mails a link built from `NEXTAUTH_URL` — never from the request Host, which would allow poisoned reset links. `/forgot-password` tells the caller when an address is not registered, and reports send failures, rather than masking both behind one generic reply — `/api/register` already discloses whether an email is taken, so hiding it here only confused real users. Per-IP and per-email rate limits are what bound abuse. Needs mail configured in `/settings`; without it the endpoint says so instead of silently dropping mail.
- `npm run set-password -- <email>` is the out-of-band recovery path when mail is unavailable.
- `npm run mail-test -- <email>` sends through the configured provider and translates the common failures (bad key, unverified domain, quota, blocked SMTP port) into actionable messages.
- Edge constraint: `lib/auth.config.ts` is edge-safe (no Prisma/bcrypt) and is what `middleware.ts` imports. The Credentials provider (Prisma + bcrypt) lives only in `lib/auth.ts` (node runtime).

## Settings

Admin-editable API settings are managed through `/settings` and persisted to PostgreSQL table `AppSetting`.

Do not require users to edit `.env` for OpenAI, Seedance, or S3 keys.

Keep these in deployment environment variables:

- `DATABASE_URL`
- `REDIS_URL`
- `NEXTAUTH_SECRET`
- `NEXTAUTH_URL`
- `ADMIN_EMAILS`

These are needed before the app can authenticate users and read settings from the database.

## Current Defaults

- `OPENAI_STORY_MODEL`: `gpt-5.4-mini`
- `OPENAI_PROMPT_MODEL`: `gpt-5.4-mini`
- `OPENAI_IMAGE_MODEL`: `gpt-image-2`
- `OPENAI_TRANSCRIBE_MODEL`: `gpt-4o-transcribe`
- `MAIL_PROVIDER`: `zeabur` (`smtp` is the alternative)
- `SMTP_PORT`: `587` (465 switches to implicit TLS; everything else requires STARTTLS)
- `ARK_BASE_URL`: `https://ark.ap-southeast.bytepluses.com/api/v3`
- `SEEDANCE_MODEL`: `dreamina-seedance-2-0-260128`

Transcription model behavior (`lib/transcribe.ts`):

- `whisper-1` → `verbose_json` with segment timestamps (the transcript UI splits by timestamp).
- Any other file-transcription model (e.g. `gpt-4o-transcribe`, the default) → plain text transcript, no timestamps.
- `gpt-realtime-whisper` is a realtime model that 404s on `/audio/transcriptions`; it is mapped to `gpt-4o-transcribe`.

## Key Files

- `app/page.tsx`: YouTube／TikTok／IG Reels URL 入口與建立專案的影片上傳。
- `app/quick/QuickStudio.tsx`, `app/api/quick/*`: the one-shot text-to-image / text-to-video studio.
- `app/api/projects/route.ts`, `app/api/projects/upload/route.ts`: create-project (URL) and upload-video endpoints.
- `app/login/page.tsx`, `app/register/page.tsx`: auth pages.
- `app/settings/page.tsx`: admin settings UI.
- `app/api/settings/route.ts`: settings API (admin-only).
- `app/api/auth/[...nextauth]/route.ts`, `app/api/register/route.ts`: auth endpoints.
- `app/health/page.tsx`, `app/api/health/status/route.ts`, `app/api/health/clean-failed/route.ts`: admin health dashboard + checks.
- `app/api/health/route.ts`: public liveness probe (`{ ok: true }`).
- `lib/auth.ts` / `lib/auth.config.ts`: NextAuth setup (node) / edge-safe base config.
- `lib/authz.ts`, `lib/project-access.ts`: session + ownership helpers for API routes.
- `lib/settings.ts`: setting definitions, DB access, and TTL cache.
- `lib/openai.ts`: text, vision, storyboard, and image-generation OpenAI calls.
- `lib/transcribe.ts`: audio transcription + source-URL allowlist.
- `lib/mailer.ts`: mail transports (Zeabur Email REST + SMTP) and the password-reset mail template.
- `lib/password-reset.ts`: reset-token issue/verify/consume helpers.
- `lib/visual.ts`: video download, frame extraction, visual analysis. `extractVideoFrames` probes the duration from ffmpeg's own stderr and samples `FRAME_COUNT` frames evenly across the whole video, returning `durationSec`. Do not go back to a fixed `fps=1/3`: that only ever covered the first 24 seconds, which silently misrepresents anything longer — most Reels, and any longer uploaded file. `Project.sourceDurationSec` stores it so the UI can label each frame's real timestamp.
- `lib/video.ts` / `lib/ffmpeg.ts`: size-capped video download / shared ffmpeg path (frame extraction + yt-dlp).
- `lib/safe-fetch.ts`: SSRF guard for fetching upstream URLs.
- `lib/rate-limit.ts`: Redis-backed rate limiting.
- `lib/queue.ts`: BullMQ queue, Redis connection, `WORKER_HEARTBEAT_KEY`, job-retention opts.
- `middleware.ts`: protects page routes (`/`, `/projects/*`, `/settings/*`, `/health`).
- `scripts/worker.ts`: BullMQ job processor + Redis heartbeat.
- `prisma/schema.prisma`: includes `User`, `Project`, `Scene`, `AppSetting`, `PasswordResetToken`, and `Generation`.

## Commands

```bash
npm run typecheck
npm run db:push
npm run dev
npm run worker
```

If global `npm` is unavailable in Codex, use the workspace-local npm CLI and bundled Node runtime already set up in this workspace.

## Development Notes

- Keep UI copy in Traditional Chinese.
- Do not print or commit actual API keys.
- Do not commit `.npm-cache/`.
- Keep `DATABASE_URL`, `REDIS_URL`, and `NEXTAUTH_SECRET` out of user-facing documentation examples unless redacted.
- Prefer clear user-facing error messages over raw Prisma, Redis, OpenAI, or Seedance errors. Do not leak raw URLs in error strings.
- New API routes must enforce auth + ownership (`lib/authz.ts` / `lib/project-access.ts`).
- Never `fetch` an upstream-provided URL without `lib/safe-fetch.ts`.
- If adding settings, update `lib/settings.ts`, `/settings`, `.env.example`, README, and this file together.
