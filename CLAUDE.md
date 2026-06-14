# CLAUDE.md

## Project

`lurevid` is a Next.js + TypeScript app for analyzing and adapting short-form videos from Instagram Reels and TikTok.

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

## Settings

User-editable API settings are managed through `/settings` and persisted to PostgreSQL table `AppSetting`.

Do not require users to edit `.env` for OpenAI, Seedance, or S3 keys.

Keep these in deployment environment variables:

- `DATABASE_URL`
- `REDIS_URL`

These are needed before the app can read settings from the database.

## Current Defaults

- `OPENAI_STORY_MODEL`: `gpt-5.4-mini`
- `OPENAI_PROMPT_MODEL`: `gpt-5.4-mini`
- `OPENAI_IMAGE_MODEL`: `gpt-image-2`
- `OPENAI_TRANSCRIBE_MODEL`: `gpt-4o-transcribe`
- `SEEDANCE_MODEL`: `dreamina-seedance-2-0-fast-260128`

Note: `gpt-realtime-whisper` is a realtime transcription model and should not be sent to `/audio/transcriptions` for downloaded video files. The current file transcription flow uses `gpt-4o-transcribe`; if a user enters `gpt-realtime-whisper`, `lib/transcribe.ts` maps it to `gpt-4o-transcribe` to avoid the 404 invalid URL failure.

## Key Files

- `app/page.tsx`: URL entry and optional transcript fallback.
- `app/settings/page.tsx`: user settings UI.
- `app/api/settings/route.ts`: settings API.
- `lib/settings.ts`: setting definitions and DB access.
- `lib/openai.ts`: text, vision, storyboard, and image-generation OpenAI calls.
- `lib/transcribe.ts`: audio transcription.
- `lib/visual.ts`: video download, frame extraction, visual analysis.
- `scripts/worker.ts`: BullMQ job processor.
- `prisma/schema.prisma`: includes `Project`, `Scene`, and `AppSetting`.

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
- Keep `DATABASE_URL` and `REDIS_URL` out of user-facing documentation examples unless redacted.
- Prefer clear user-facing error messages over raw Prisma, Redis, OpenAI, or Seedance errors.
- If adding settings, update `lib/settings.ts`, `/settings`, README, and this file together.
