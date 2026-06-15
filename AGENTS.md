# AGENTS.md

給在這個 repo 工作的 AI 代理與貢獻者的指南。也請一併閱讀 `CLAUDE.md`（專案規則）與 `STYLE.md`（風格）。

## 專案速覽

lurevid = Next.js App Router（Web）+ BullMQ（Worker），共用同一份程式碼與 Dockerfile。
使用者貼上 IG Reels / TikTok 連結，系統下載影片、抽影格、轉錄、AI 分析 → 拆結構 → 改編 → 9 格分鏡圖 → Seedance 影片 → ffmpeg 合成。

## 兩個進程

- **Web**：`npm run dev`（或 `npm run start`）。提供 UI 與 API，把任務丟進 Redis queue。
- **Worker**：`npm run worker`。處理 `analyze / structure / adapt / storyboard / video` 五種 job（見 `scripts/worker.ts`）。

兩者都會從 `AppSetting`（DB）讀 OpenAI / Seedance / S3 設定，env 為後備。本機要同時開 Web 與 Worker 才能跑完整流程。

## 本機開發

```bash
npm install
cp .env.example .env        # 填 DATABASE_URL / REDIS_URL / NEXTAUTH_SECRET / ADMIN_EMAILS
npm run db:push             # 套用 Prisma schema（含 User、Project.userId）
npm run dev                 # 終端機 1：Web
npm run worker              # 終端機 2：Worker
```

到 `/register` 用 `ADMIN_EMAILS` 內的 Email 註冊，再到 `/settings` 填 API 金鑰。

## 改動前必讀

- 驗證/授權：`lib/auth.ts`、`lib/auth.config.ts`（edge 安全，middleware 用）、`lib/authz.ts`、`lib/project-access.ts`。
  - middleware 跑在 edge，**不可** import Prisma / bcrypt。Credentials provider 只放 `lib/auth.ts`。
- 安全工具：`lib/safe-fetch.ts`（SSRF 防護）、`lib/rate-limit.ts`、`lib/limits.ts`、`lib/transcribe.ts` 的 URL allowlist。
- Worker 韌性：Seedance 輪詢有逾時與 per-scene 容錯；重試是冪等的（保留已成功片段）。
- 影片合成：用 `lib/ffmpeg.ts` 的 `ffmpegPath()`，合成是重新編碼（非 `-c copy`）。

## 驗證

```bash
npm run typecheck   # 必過
npm run build       # 確認 Next 與 middleware 可建置（需設 NEXTAUTH_SECRET）
```

端到端：註冊 → 登入 → 建專案 → 走完六步 → 下載成品。並驗證：未登入存取 API 被擋、非擁有者拿不到他人專案、非管理員看不到 `/settings`。

## 提交與部署

- 開發分支見 `CLAUDE.md` / 任務說明；除非被要求，不要開 PR。
- 部署改動（Dockerfile、env）要連同 README 一起更新。
- Schema 變更後在部署環境跑 `npm run db:push`。
