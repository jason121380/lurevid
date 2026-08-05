# Cobalt-first 來源影片下載設計

## 目標

讓 lurevid 對 YouTube、TikTok 與 Instagram Reels 優先使用同一個 Zeabur Project 內的自架 Cobalt 服務下載完整影片；Cobalt 失敗時，自動回退到現有 yt-dlp 流程。兩者都失敗時，維持繁體中文的友善錯誤與直接上傳影片建議。

## 範圍

- 支援 YouTube 公開影片、Shorts 與 Live replay 網址。
- 保留 TikTok 與 Instagram Reels 現有支援。
- Instagram Stories、Facebook Stories 與 Facebook 一般影片不在本次範圍。
- 不更動上傳 MP4、MOV、WebM 的既有流程。
- 不把 Cobalt 開放到公網，也不將其設定放進瀏覽器。

## 部署拓撲

Cobalt 使用官方 `ghcr.io/imputnet/cobalt:11` image，作為目前 Zeabur Project 中的獨立服務。它只保留 `cobalt-api.zeabur.internal:9000` 內網連線，設定：

```env
API_URL=http://cobalt-api.zeabur.internal:9000/
DURATION_LIMIT=3600
```

lurevid Worker 使用以下部署環境變數連線：

```env
COBALT_API_URL=http://cobalt-api.zeabur.internal:9000/
```

若 `COBALT_API_URL` 未設定，下載流程直接使用 yt-dlp，讓本機開發、回滾與未部署 Cobalt 的環境繼續運作。

## 架構

新增 `lib/cobalt.ts`，集中處理 Cobalt API 呼叫、回應解析、內網來源限制、下載串流與檔案大小限制。`lib/visual.ts` 保留來源影片下載的公開介面，但內部改為：

1. 驗證並正規化使用者來源網址。
2. 若設定 Cobalt，呼叫其 `POST /`，並指定 `alwaysProxy: true`，避免 Worker 再跟隨 Cobalt 回傳的任意外部下載網址。
3. 只接受由設定的 Cobalt origin 提供的 tunnel URL，將內容串流至暫存檔，並套用既有最大下載大小限制。
4. Cobalt 任一步驟失敗時，只在伺服器日誌記錄淨化後的診斷資訊，隨即回退到現有 yt-dlp + cookies 流程。
5. yt-dlp 仍失敗時，才交由既有錯誤轉譯輸出繁中訊息。

正常完整分析下載一次影片後，既有程式直接用該檔案轉錄和抽影格。只有完整影片下載或轉錄失敗後的純音訊備援繼續使用現有 yt-dlp。

## URL 白名單

後端 `lib/transcribe.ts` 與首頁 `app/page.tsx` 同步接受：

- `youtube.com/watch?v=...`
- `youtube.com/shorts/...`
- `youtube.com/live/...`
- `youtu.be/...`
- 現有 TikTok 網址
- 現有 Instagram `/reel/`、`/reels/` 網址

YouTube 頻道、播放清單首頁與其他無法明確認定為單一影片的路徑不接受。所有來源仍僅允許 HTTP／HTTPS，並以 `URL` 解析與精確 host/path 規則避免相似網域繞過。

## Cobalt 回應與錯誤處理

- 接受能提供單一影片串流的成功回應。
- `error`、不支援的 picker、多媒體選擇、非預期 JSON、逾時、HTTP 錯誤、空 body、過大檔案或不符合 Cobalt origin 的 URL，均視為 Cobalt 失敗並回退。
- Cobalt 的原始錯誤、來源網址與內網位址不得顯示給使用者。
- yt-dlp 維持現有 `describeDownloadError` 行為；登入牆、cookies 過期、429 與 extractor 失敗仍提供可行動的繁中訊息。
- Cobalt 服務故障不得阻止 yt-dlp fallback。

## 設定與介面

`COBALT_API_URL` 是 Worker 基礎設施設定，僅放在部署環境變數，不加入管理員設定頁或資料庫。設定頁現有 `YTDLP_COOKIES` 保持不變。

首頁與建立專案 API 的說明及錯誤文案改成「YouTube、TikTok 或 IG Reels」。專案的 `sourcePlatform` 對 YouTube 回傳 `YouTube`。

## 測試

- URL 單元測試：接受四種 YouTube 單一影片形式；拒絕相似 host、非 HTTP(S)、頻道及非影片頁。
- Cobalt 單元測試：成功 tunnel、未設定時跳過、API 錯誤、無效回應、錯誤 URL、超過大小限制。
- fallback 測試：Cobalt 失敗後會執行 yt-dlp；Cobalt 成功時不執行 yt-dlp。
- 安全測試：不跟隨非 Cobalt origin 的內網／外部 URL，錯誤訊息不洩漏原始來源 URL 或內網位址。
- 既有測試、`npm run typecheck`、`npm test` 與帶 `NEXTAUTH_SECRET` 的 `npm run build` 全部通過。

## 文件與部署

同步更新 README、CLAUDE.md、AGENTS.md 與環境變數範例，說明 Cobalt 是選填的優先下載器，未設定或失敗時回退 yt-dlp。程式部署後，在 lurevid Worker 服務新增 `COBALT_API_URL`，Web 服務不需要此變數。

