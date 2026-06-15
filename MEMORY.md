# MEMORY

## Current Goal

lurevid is a public multi-user short-video analysis and adaptation app. Users register/login, paste an Instagram Reels, TikTok, or Douyin URL, and the system analyzes not only transcript text, but also video frames, captions/on-screen text, shot composition, editing rhythm, and visual storytelling.

## Runtime Setup

- Web runs on Next.js App Router.
- Worker runs with BullMQ.
- PostgreSQL and Redis are expected to be cloud services, currently configured through environment variables.
- `DATABASE_URL`, `REDIS_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, and `ADMIN_EMAILS` must stay in `.env` / deployment environment: the app needs them to authenticate users before it can read settings from the database.
- Admin-managed API settings live in PostgreSQL table `AppSetting` and are edited at `/settings` (admin-only).
- Web and worker both read OpenAI / Seedance / S3 settings from `AppSetting`, falling back to environment variables only when useful. Settings are cached in-process with a short TTL.

## Authentication & Ownership

- NextAuth (Credentials provider, JWT session). Register at `/register`, login at `/login`.
- `User` model in Prisma; `Project.userId` ties each project to its creator.
- All project APIs check ownership; `/settings` + `/api/settings` are admin-only (`ADMIN_EMAILS`).
- `middleware.ts` (edge, imports only `lib/auth.config.ts`) guards page routes. API routes self-check via `lib/authz.ts`.
- bcrypt + Prisma only live in `lib/auth.ts` (node), never imported into middleware/edge.

## User Settings

The left sidebar includes a Settings page at `/settings`.

Settings managed by the user:

- `OPENAI_API_KEY`
- `OPENAI_STORY_MODEL`
- `OPENAI_PROMPT_MODEL`
- `OPENAI_IMAGE_MODEL`
- `OPENAI_TRANSCRIBE_MODEL`
- `ARK_API_KEY`
- `SEEDANCE_MODEL`
- `S3_ENDPOINT`
- `S3_REGION`
- `S3_BUCKET`
- `S3_ACCESS_KEY_ID`
- `S3_SECRET_ACCESS_KEY`
- `S3_PUBLIC_URL`
- `S3_FORCE_PATH_STYLE`

Secret fields are not returned in full by `/api/settings`; the API returns configured state and a masked value.

## Model Defaults

- Text / analysis model: `gpt-5.4-mini`
- Prompt model: `gpt-5.4-mini`
- Image generation model: `gpt-image-2`
- File transcription model: `gpt-4o-transcribe`
- Seedance model: `dreamina-seedance-2-0-fast-260128`

Note: `whisper-1` yields segment-timestamped transcripts; `gpt-4o-transcribe` (default) yields plain-text transcripts. `gpt-realtime-whisper` is a realtime model that 404s on the file endpoint, so `lib/transcribe.ts` maps it to `gpt-4o-transcribe`.

## Analysis Pipeline

The `analyze` worker job should:

1. Download the source video with `yt-dlp`.
2. Transcribe audio with OpenAI.
3. Extract up to 8 video frames using `ffmpeg-static`.
4. Send frames plus transcript to OpenAI vision analysis.
5. Combine transcript and visual analysis into the main short-video strategy analysis.
6. Persist `sourceTranscript`, `analysis`, status, message, and progress in PostgreSQL.

If downloading the video or visual frame analysis fails, the worker should still attempt text-only analysis when transcript is available. If there is no transcript and video/audio download fails, mark the project failed with a helpful message asking the user to paste a transcript.

## Storage

S3-compatible object storage is used for generated storyboard images and final videos.

Why it matters:

- Seedance needs public image URLs.
- Web and worker services do not share local disk in cloud deployment.
- Final videos must be playable/downloadable by the frontend.

Supported providers include Cloudflare R2 (recommended; the `/settings` labels are R2-oriented), AWS S3, Zeabur Object Storage, or any S3-compatible bucket. The env var keys stay `S3_*`; only the UI labels say R2. The bucket must allow public reads (R2: enable the r2.dev public URL or a custom domain) so Seedance and the frontend can fetch by URL.

## Monitoring & Queue Health

- `/health` is an admin-only dashboard: PostgreSQL, Redis, worker liveness, queue depth, and OpenAI/Seedance/R2 config. Checks are timeout-bounded so the endpoint never hangs.
- Worker liveness is detected via a Redis heartbeat (`WORKER_HEARTBEAT_KEY`, EX 60, written every 15s in `scripts/worker.ts`).
- `/api/health/clean-failed` (admin) clears accumulated failed/completed job records; jobs are enqueued with `removeOnComplete` + `removeOnFail: 50` to cap accumulation.
- Platform downloads: yt-dlp comes from the **nightly** channel in Docker (`YTDLP_CHANNEL`); Instagram 429 from datacenter IPs is IP blocking (not a bug).

## Local Tools

This workspace uses:

- Bundled Node runtime from Codex.
- Workspace-local npm CLI under `.tools/package`.
- Workspace-local `yt-dlp` under `.tools/bin/yt-dlp`.
- `ffmpeg-static` npm dependency for frame extraction and video processing support.

Do not commit `.npm-cache/`.

## Verification

Useful commands:

```bash
npm run typecheck
npm run db:push
npm run dev
npm run worker
```

In this Codex environment, commands are usually launched through the bundled Node/npm path rather than global `npm`.
