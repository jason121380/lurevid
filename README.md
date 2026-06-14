# lurevid

短影音分析改編平台：使用者貼上一支 IG Reels / TikTok 連結，系統抓影片音訊轉成逐字稿，
依序做「分析 → 拆解結構 → 改編腳本」（每步都可編輯後再繼續），接著產生 9 格分鏡與分鏡圖，
最後送進 Seedance 2.0 變成影片片段並用 ffmpeg 合成。

## 技術棧

- Next.js App Router + TypeScript
- Tailwind CSS，視覺參考 `jason121380/luredash`
- yt-dlp 下載影片音訊 + OpenAI 轉錄（`OPENAI_TRANSCRIBE_MODEL`）
- OpenAI Responses API：`OPENAI_STORY_MODEL` + `OPENAI_PROMPT_MODEL`（分析／結構／改編／分鏡）
- OpenAI Images API：`OPENAI_IMAGE_MODEL`
- BytePlus ModelArk Seedance 2.0
- PostgreSQL + Prisma
- Redis + BullMQ worker
- ffmpeg 合成影片
- S3 相容物件儲存（分鏡圖與成品影片）
- Zeabur 部署（Web 與 Worker 兩個服務共用同一個 Docker image）

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
OPENAI_TRANSCRIBE_MODEL="whisper-1"
ARK_API_KEY="BytePlus ModelArk API Key"
SEEDANCE_MODEL="dreamina-seedance-2-0-fast-260128"

# S3 相容物件儲存（例：Cloudflare R2）
S3_ENDPOINT="https://<account-id>.r2.cloudflarestorage.com"
S3_REGION="auto"
S3_BUCKET="lurevid"
S3_ACCESS_KEY_ID="..."
S3_SECRET_ACCESS_KEY="..."
S3_PUBLIC_URL="https://你的公開-bucket-網域"
S3_FORCE_PATH_STYLE="false"

# Worker 合成影片的本機暫存目錄
STORAGE_DIR="./storage/generated"
```

> 為什麼需要物件儲存：Web 與 Worker 是兩個獨立的 Zeabur 服務、各自的本機磁碟不共用。
> 分鏡圖必須有公開網址才能交給 Seedance，成品影片也要讓前端能直接播放與下載，
> 因此分鏡圖與 `final.mp4` 都由 Worker 上傳到物件儲存，網址存進資料庫。
> 物件儲存的 bucket 需設定為可公開讀取（或設定公開網域 `S3_PUBLIC_URL`）。

### 選填：Worker 並行設定

Worker 會並行處理分鏡圖、Seedance 任務與影片下載，可用以下變數調整並行上限（預設值已適合大多數情境）：

```env
WORKER_CONCURRENCY="1"   # 同時處理的專案數
IMAGE_CONCURRENCY="3"    # 同時產生的分鏡圖數
SEEDANCE_CONCURRENCY="3" # 同時送出/輪詢/下載的 Seedance 片段數
```

## Zeabur 部署

Web 與 Worker 兩個服務使用**同一個 repo 與同一個 Dockerfile**，只差在 Start Command。
專案根目錄有 `Dockerfile`、沒有 `zeabur.json`，Zeabur 會自動以 Docker 建置（worker 需要 ffmpeg）。

1. 建立 PostgreSQL 服務。
2. 建立 Redis 服務。
3. 建立物件儲存（例：Cloudflare R2 bucket），設定可公開讀取。
4. 建立 **Web 服務**，指向此專案，設定上方所有環境變數。預設 Start Command 即 `npm run start`。
5. 部署後執行一次：

```bash
npm run db:push
```

6. 再建立一個 **Worker 服務**，使用同一份 repo 與環境變數，把 Start Command 覆寫為：

```bash
npm run worker
```

Web 服務負責使用者介面與 API；Worker 服務負責 OpenAI、Seedance、ffmpeg 合成，並把分鏡圖與成品影片上傳到物件儲存。

## 工作流程

六步流程，前三步每步都會停下來讓使用者編輯後再繼續：

1. 使用者貼上 IG Reels / TikTok 連結（或手動貼逐字稿），Web 建立 project，worker 開始 `analyze` job。
2. **分析**：worker 用 yt-dlp 下載音訊、OpenAI 轉成逐字稿，再用 `OPENAI_STORY_MODEL` 分析受眾／賣點 → `ANALYSIS_READY`。
3. **分析結構**（`structure` job）：拆解 hook／鋪陳／賣點／CTA 與節奏 → `STRUCTURE_READY`。
4. **改編**（`adapt` job）：改寫成全新原創腳本 → `ADAPT_READY`。
5. **分鏡**（`storyboard` job）：把腳本拆 9 鏡、產生 prompts 與 9 張分鏡圖（上傳物件儲存）→ `STORYBOARD_READY`。
6. **變成影片 + 合成**（`video` job）：每張分鏡圖送進 Seedance，9 段完成後 ffmpeg 合成 `final.mp4` 並上傳物件儲存 → `COMPLETED`。

> ⚠️ 從機房 IP（Zeabur）抓 IG/TikTok 影片常會被平台阻擋。`analyze` 抓取失敗時 project 會進入 `FAILED`，
> 前端會提供「手動貼逐字稿重新分析」的備援；只要逐字稿有內容，後續流程都能照常進行。

預設文字模型是 `gpt-5.4-mini`，預設圖像模型是 `gpt-image-1-mini`，轉錄模型預設 `whisper-1`，都可用環境變數切換。
