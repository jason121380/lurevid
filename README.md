# Seedance Studio

正式版網站架構：使用者只輸入想法，系統先用 OpenAI 兩段文字模型產生 9 格分鏡與 prompts，再用 OpenAI Image 產生 9 張分鏡圖。使用者確認分鏡圖後，worker 把每張圖送進 Seedance 2.0 變成影片片段，最後用 ffmpeg 合成完整影片。

## 技術棧

- Next.js App Router + TypeScript
- Tailwind CSS，視覺參考 `jason121380/luredash`
- OpenAI Responses API：`OPENAI_STORY_MODEL` + `OPENAI_PROMPT_MODEL`
- OpenAI Images API：`OPENAI_IMAGE_MODEL`
- BytePlus ModelArk Seedance 2.0
- PostgreSQL + Prisma
- Redis + BullMQ worker
- ffmpeg 合成影片
- Zeabur 部署

## 本機啟動

```bash
npm install
cp .env.example .env
npm run db:push
npm run dev
```

另一個終端機啟動 worker：

```bash
npm run worker
```

## 必要環境變數

```env
DATABASE_URL="postgresql://..."
REDIS_URL="redis://..."
OPENAI_API_KEY="sk-..."
OPENAI_STORY_MODEL="gpt-5.4-mini"
OPENAI_PROMPT_MODEL="gpt-5.4-mini"
OPENAI_IMAGE_MODEL="gpt-image-1-mini"
ARK_API_KEY="BytePlus ModelArk API Key"
SEEDANCE_MODEL="dreamina-seedance-2-0-fast-260128"
PUBLIC_BASE_URL="https://你的-zeabur-domain"
STORAGE_DIR="./storage/generated"
```

## Zeabur 部署

1. 建立 PostgreSQL 服務。
2. 建立 Redis 服務。
3. 建立 Web 服務，指向此專案。
4. 設定上方環境變數。
5. 部署後執行一次：

```bash
npm run db:push
```

6. 再建立一個 Worker 服務，使用同一份 repo 與環境變數，Start Command：

```bash
npm run worker
```

Web 服務負責使用者介面與 API；Worker 服務負責 OpenAI、Seedance、下載影片與 ffmpeg 合成。

## 工作流程

目前流程：

1. 使用者輸入想法。
2. Web 建立 project，worker 開始 `generate-storyboard` job。
3. `OPENAI_STORY_MODEL` 把想法拆成 9 個連續鏡頭。
4. `OPENAI_PROMPT_MODEL` 把 9 格分鏡改寫成英文 image prompts 與 Seedance prompts。
5. `OPENAI_IMAGE_MODEL` 產生 9 張分鏡圖。
6. project 進入 `STORYBOARD_READY`，前端顯示「變成影片」。
7. 使用者按「變成影片」，worker 開始 `generate-video` job。
8. worker 把每張分鏡圖與對應 prompt 送進 Seedance。
9. 9 段影片完成後，worker 用 ffmpeg 合成 `final.mp4`。

預設文字模型是 `gpt-5.4-mini`，預設圖像模型是 `gpt-image-1-mini`，都可用環境變數切換。
