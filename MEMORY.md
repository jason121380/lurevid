# MEMORY

## Current Goal

lurevid is a short-video analysis and adaptation app. Users paste an Instagram Reels or TikTok URL. The system should analyze not only transcript text, but also video frames, captions/on-screen text, shot composition, editing rhythm, and visual storytelling.

## Runtime Setup

- Web runs on Next.js App Router.
- Worker runs with BullMQ.
- PostgreSQL and Redis are expected to be cloud services, currently configured through environment variables.
- `DATABASE_URL` and `REDIS_URL` must stay in `.env` / deployment environment because the app needs them before it can read user settings from the database.
- User-managed API settings live in PostgreSQL table `AppSetting` and are edited at `/settings`.
- Web and worker both read OpenAI / Seedance / S3 settings from `AppSetting`, falling back to environment variables only when useful.

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

Note: `gpt-realtime-whisper` is a realtime transcription model. The current app transcribes downloaded video/audio files through the file transcription endpoint, so `gpt-4o-transcribe` is the compatible default. If a user enters `gpt-realtime-whisper`, `lib/transcribe.ts` maps it to `gpt-4o-transcribe` for file uploads.

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

Supported providers include Cloudflare R2, AWS S3, Zeabur Object Storage, or any S3-compatible bucket.

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
