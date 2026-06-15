# 單一 image 同時供 Web（npm run start）與 Worker（npm run worker）兩個服務使用。
# Worker 需要 tsx、lib/ 原始碼、tsconfig 與 ffmpeg，因此 runner 帶上完整相依與原始碼。
FROM node:24-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install

FROM node:24-bookworm-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:24-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
# 可釘版本以利重現建置；預設 latest（IG/TikTok 變動頻繁時較不易壞）。
ARG YTDLP_VERSION=latest
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg ca-certificates curl \
  && rm -rf /var/lib/apt/lists/* \
  && if [ "$YTDLP_VERSION" = "latest" ]; then \
       YTDLP_URL="https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux"; \
     else \
       YTDLP_URL="https://github.com/yt-dlp/yt-dlp/releases/download/${YTDLP_VERSION}/yt-dlp_linux"; \
     fi \
  && curl -fSL --retry 3 --max-time 120 "$YTDLP_URL" -o /usr/local/bin/yt-dlp \
  && chmod a+rx /usr/local/bin/yt-dlp \
  && /usr/local/bin/yt-dlp --version
COPY --from=builder /app ./
EXPOSE 3000
# Web 服務用此預設指令；Worker 服務在 Zeabur 把 Start Command 覆寫為：npm run worker
CMD ["npm", "run", "start"]
