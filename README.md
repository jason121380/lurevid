# lurevid

短影音分析創作平台：使用者貼上一支 IG Reels / TikTok / 抖音連結，系統會下載影片、抽取影格分析畫面分鏡，
並把音訊轉成逐字稿。接著依序做「分析 → 拆解結構 → 改編腳本」（每步都可編輯後再繼續），
產生 9 格分鏡與分鏡圖，最後送進 Seedance 2.0 變成影片片段並用 ffmpeg 合成。

## 技術棧

- Next.js App Router + TypeScript
- Tailwind CSS，視覺參考 `jason121380/luredash`
- yt-dlp 下載影片與音訊（Docker 內預設用 nightly 版，跟得上 IG/TikTok/抖音改版）
- ffmpeg-static 抽取影片影格，做畫面／字幕／分鏡節奏分析
- OpenAI 轉錄（`OPENAI_TRANSCRIBE_MODEL`）
- OpenAI Responses API：`OPENAI_STORY_MODEL` + `OPENAI_PROMPT_MODEL`（視覺分析／內容分析／結構／改編／分鏡）
- OpenAI Images API：`OPENAI_IMAGE_MODEL`
- BytePlus ModelArk Seedance 2.0
- PostgreSQL + Prisma
- Redis + BullMQ worker
- ffmpeg 合成影片
- S3 相容物件儲存（分鏡圖與成品影片），建議用 Cloudflare R2
- NextAuth（Email + 密碼登入）：多使用者，每個專案綁定建立者
- 設定頁：**僅管理員**可在左側選單「設定」填入 OpenAI、Seedance、R2 等 API key，設定存入 PostgreSQL
- `/health`：**僅管理員**的系統健康頁（DB / Redis / Worker / 佇列 / 金鑰狀態）
- Zeabur 部署（Web 與 Worker 兩個服務共用同一個 Docker image）

## 支援平台與監控

- 支援來源：Instagram Reels、TikTok、抖音（`lib/transcribe.ts` 以 allowlist 驗證）。
- yt-dlp 在 Docker 預設用 nightly 頻道（build arg `YTDLP_CHANNEL=nightly|stable|<版本>`）。
- 從機房 IP（Zeabur）抓 IG 常被擋 429，這是平台 IP 封鎖、非程式問題；可改用手動貼逐字稿或代理。
- Worker 每 15 秒寫一次 Redis 心跳，`/health` 用它判斷 worker 是否存活；該頁也能一鍵清除累積的失敗任務紀錄。
- 物件儲存設定頁文案是 R2 導向，但環境變數鍵名仍為 `S3_*`（沿用 S3 SDK，相容 R2）。

## 帳號與權限

- 這是對外公開的多使用者服務，所有頁面與 API 都需要登入。
- 第一次使用請到 `/register` 註冊，再到 `/login` 登入。
- 每個專案綁定建立者，使用者只能看到/操作自己的專案。
- `ADMIN_EMAILS`（逗號分隔）內的 Email 才是管理員，只有管理員能進 `/settings` 並讀寫 API 金鑰。

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

本機開啟：

```txt
http://127.0.0.1:3000
```

設定頁：

```txt
http://127.0.0.1:3000/settings
```

## 必要環境變數

```env
DATABASE_URL="postgresql://..."
REDIS_URL="redis://..."

# 身分驗證（必填）
NEXTAUTH_SECRET="用 openssl rand -base64 32 產生的長字串"
NEXTAUTH_URL="https://你的網域"
ADMIN_EMAILS="admin@example.com"

OPENAI_API_KEY="sk-..."
OPENAI_STORY_MODEL="gpt-5.4-mini"
OPENAI_PROMPT_MODEL="gpt-5.4-mini"
OPENAI_IMAGE_MODEL="gpt-image-2"
OPENAI_TRANSCRIBE_MODEL="gpt-4o-transcribe"
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

`DATABASE_URL`、`REDIS_URL`、`NEXTAUTH_SECRET`、`ADMIN_EMAILS` 必須放在環境變數：app 要先連上 PostgreSQL / Redis、並具備驗證設定，才能讀其他設定與處理 queue。
OpenAI、Seedance、S3 這類 API key 由**管理員**在設定頁管理，會存入 `AppSetting` 資料表。

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
4. 建立 **Web 服務**，指向此專案，至少設定 `DATABASE_URL`、`REDIS_URL`、`NEXTAUTH_SECRET`、`NEXTAUTH_URL`、`ADMIN_EMAILS`。預設 Start Command 即 `npm run start`。
5. 部署後執行一次（會建立 User 與 Project.userId 等資料表）：

```bash
npm run db:push
```

6. 到 `/register` 用 `ADMIN_EMAILS` 內的 Email 註冊並登入，再打開 `/settings`，填入 OpenAI、Seedance、S3 等 API key。
7. 再建立一個 **Worker 服務**，使用同一份 repo 與環境變數，把 Start Command 覆寫為：

```bash
npm run worker
```

Web 服務負責使用者介面與 API；Worker 服務負責 OpenAI、Seedance、ffmpeg 合成，並把分鏡圖與成品影片上傳到物件儲存。

## 工作流程

六步流程，前三步每步都會停下來讓使用者編輯後再繼續：

1. 使用者貼上 IG Reels / TikTok 連結（或手動貼逐字稿），Web 建立 project，worker 開始 `analyze` job。
2. **分析**：worker 用 yt-dlp 下載影片，抽取最多 8 張影格分析畫面、字幕、構圖、剪輯節奏；同時把音訊轉成逐字稿，再用 `OPENAI_STORY_MODEL` 整合分析受眾／賣點／視覺分鏡 → `ANALYSIS_READY`。
3. **分析結構**（`structure` job）：拆解 hook／鋪陳／賣點／CTA 與節奏 → `STRUCTURE_READY`。
4. **改編**（`adapt` job）：改寫成全新原創腳本 → `ADAPT_READY`。
5. **分鏡**（`storyboard` job）：把腳本拆 9 鏡、產生 prompts 與 9 張分鏡圖（上傳物件儲存）→ `STORYBOARD_READY`。
6. **變成影片 + 合成**（`video` job）：每張分鏡圖送進 Seedance，9 段完成後 ffmpeg 合成 `final.mp4` 並上傳物件儲存 → `COMPLETED`。

> ⚠️ 從機房 IP（Zeabur）抓 IG/TikTok 影片常會被平台阻擋。`analyze` 抓取失敗時 project 會進入 `FAILED`，
> 前端會提供「手動貼逐字稿重新分析」的備援；只要逐字稿有內容，後續流程都能照常進行。

預設文字模型是 `gpt-5.4-mini`，預設圖像模型是 `gpt-image-2`，影片檔案轉錄模型預設 `gpt-4o-transcribe`，都可用環境變數或設定頁切換。

轉錄模型行為：

- `whisper-1`：輸出含 segment 時間戳的逐字稿（逐字稿頁會用時間戳分行顯示）。
- `gpt-4o-transcribe`（預設）或其他檔案轉錄模型：輸出純文字逐字稿（無時間戳）。
- `gpt-realtime-whisper` 是 Realtime 串流模型，不適合丟到 `/audio/transcriptions`；若填入此值，會自動改用 `gpt-4o-transcribe`，避免 404。
