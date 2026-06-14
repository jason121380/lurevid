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
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app ./
EXPOSE 3000
# Web 服務用此預設指令；Worker 服務在 Zeabur 把 Start Command 覆寫為：npm run worker
CMD ["npm", "run", "start"]
