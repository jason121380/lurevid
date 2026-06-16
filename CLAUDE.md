# CLAUDE.md

## Project

`lurevid` is a Next.js + TypeScript app for analyzing and adapting short-form videos from Instagram Reels, TikTok, and Douyin.

The expected user experience:

1. User pastes a video URL.
2. App creates a project.
3. Worker downloads the video, extracts visual frames, transcribes audio, and runs AI analysis.
4. User reviews/edit analysis, structure, and adapted script.
5. App generates 9 storyboard scenes, images, Seedance clips, and a final merged video.

## Important Behavior

Analysis must include video visuals, not only transcript text.

The worker should analyze:

- Transcript / spoken content
- Extracted video frames
- On-screen captions or text
- Shot composition
- Visual pacing and editing rhythm
- Scene function in the short-video structure

Manual transcript input is only a fallback when platform download or transcription fails.

## Platforms & Downloads

- Supported source hosts: `instagram.com`, `tiktok.com`, `douyin.com`/`iesdouyin.com` (allowlist + `new URL` validation in `lib/transcribe.ts`).
- yt-dlp is installed in the Docker image from the **nightly** channel by default (`YTDLP_CHANNEL=nightly|stable|<tag>`); platforms change often and nightly tracks extractor fixes.
- Datacenter IPs (e.g. Zeabur) are frequently rate-limited/blocked by Instagram (HTTP 429). That is IP blocking, not a code bug; the manual-transcript fallback or a proxy/cookies is the workaround.

## Monitoring

- `/health` (admin-only page) shows status of PostgreSQL, Redis, the worker, the job queue, and OpenAI/Seedance/R2 configuration. Auto-refreshes; has a "clear failed records" action.
- The worker writes a Redis heartbeat (`WORKER_HEARTBEAT_KEY` in `lib/queue.ts`, EX 60) every 15s so `/api/health/status` can detect worker liveness.
- Jobs are enqueued with `removeOnComplete` + `removeOnFail: 50` so failed/completed records don't accumulate.

## Authentication

This is a public multi-user app. All pages and API routes require login (NextAuth, Credentials + JWT).

- Each `Project` is owned by a `User` (`Project.userId`); every project API checks ownership.
- `/settings` and `/api/settings` are admin-only. Admins are listed in `ADMIN_EMAILS` (comma-separated).
- `middleware.ts` protects page routes (redirect to `/login`); API routes self-check via `lib/authz.ts` and return JSON 401/403.
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
- `SEEDANCE_MODEL`: `dreamina-seedance-2-0-260128`

Transcription model behavior (`lib/transcribe.ts`):

- `whisper-1` → `verbose_json` with segment timestamps (the transcript UI splits by timestamp).
- Any other file-transcription model (e.g. `gpt-4o-transcribe`, the default) → plain text transcript, no timestamps.
- `gpt-realtime-whisper` is a realtime model that 404s on `/audio/transcriptions`; it is mapped to `gpt-4o-transcribe`.

## Key Files

- `app/page.tsx`: URL entry and optional transcript fallback.
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
- `lib/visual.ts`: video download, frame extraction, visual analysis.
- `lib/video.ts` / `lib/ffmpeg.ts`: clip download + ffmpeg merge / shared ffmpeg path.
- `lib/safe-fetch.ts`: SSRF guard for fetching upstream URLs.
- `lib/rate-limit.ts`: Redis-backed rate limiting.
- `lib/queue.ts`: BullMQ queue, Redis connection, `WORKER_HEARTBEAT_KEY`, job-retention opts.
- `middleware.ts`: protects page routes (`/`, `/projects/*`, `/settings/*`, `/health`).
- `scripts/worker.ts`: BullMQ job processor + Redis heartbeat.
- `prisma/schema.prisma`: includes `User`, `Project`, `Scene`, and `AppSetting`.

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
