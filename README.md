# Seedance Studio

正式版網站架構：使用者只輸入想法，系統用 OpenAI 兩段模型產生 9 格分鏡與 Seedance prompts，再由 worker 呼叫 Seedance 2.0 生成 9 段影片，最後用 ffmpeg 合成完整影片。

## 技術棧

- Next.js App Router + TypeScript
- Tailwind CSS，視覺參考 `jason121380/luredash`
- OpenAI Responses API：`OPENAI_STORY_MODEL` + `OPENAI_PROMPT_MODEL`
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

## OpenAI 分鏡設計

目前使用兩段模型：

1. `OPENAI_STORY_MODEL`：把想法拆成 9 個連續鏡頭。
2. `OPENAI_PROMPT_MODEL`：把 9 格分鏡改寫成英文 Seedance prompts。

預設模型是 `gpt-5.4-mini`，可用環境變數切換。
