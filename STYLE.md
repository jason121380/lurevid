# STYLE.md

lurevid 的程式與介面風格規範。新程式碼請比照既有檔案的慣例。

## UI 文案

- 所有面向使用者的文字一律用**繁體中文**（按鈕、標籤、狀態訊息、錯誤訊息）。
- 錯誤訊息要好懂、可行動，例如「請先在設定頁填入有效的 OPENAI_API_KEY」。
- 不要把原始的 Prisma / Redis / OpenAI / Seedance 錯誤直接丟給使用者；也不要在訊息中洩漏內部 URL 或路徑。
- 程式碼的註解可用繁中，說明「為什麼」而非「做什麼」。

## TypeScript / React

- 嚴格 TypeScript；`npm run typecheck` 必須全綠才提交。
- Server Component 預設用於資料讀取；需要互動（state/effect）才加 `"use client"`。
- API route handler 一律 `export const runtime = "nodejs"`（會用到 Prisma / Node API）。
- 用 `zod` 驗證所有外部輸入；使用者可編輯的文字欄位要有長度上限（見 `lib/limits.ts`）。
- 命名用具描述性的 camelCase；常數用 UPPER_SNAKE_CASE。
- 沿用既有的 Tailwind 設計 token（`var(--orange)`、`var(--warm-white)`、`.card`、`.btn` 等），不要硬寫色碼。
- 狀態用色一致：正常=綠（`var(--green)`）、注意=橘（`orange`）、異常=紅（`var(--red)`）；完成的步驟徽章用實心橘。
- 動作要有回饋：成功/失敗給 toast 或就地訊息，不要讓使用者「按了沒反應」。
- 管理員專屬頁（`/settings`、`/health`）的入口在側欄只對 admin 顯示，且對應 API 用 `requireAdmin` 把關。

## 安全

- 任何使用者/上游可控的 URL 在 `fetch` 前都要過 `lib/safe-fetch.ts`。
- 外部來源連結要用 `new URL` 解析 + host allowlist，不要用寬鬆 regex。
- 子程序（yt-dlp / ffmpeg）只能用陣列參數呼叫，且在使用者輸入前放 `--`。
- 新 API route 必須做登入與 ownership 檢查（`lib/authz.ts` / `lib/project-access.ts`）。
- 設定頁相關 API 限管理員（`requireAdmin`）。

## 機密

- 不要 log 或 commit 真實 API key。
- 不要把 `DATABASE_URL` / `REDIS_URL` / `NEXTAUTH_SECRET` 放進文件範例（除非已遮罩）。
- 不要 commit `.npm-cache/`、`.env`。

## 提交

- commit message 用祈使句、聚焦單一主題；必要時用條列說明影響。
- 加設定時同步更新 `lib/settings.ts`、`/settings`、`.env.example`、`README.md`、`CLAUDE.md`。
