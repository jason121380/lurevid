import nodemailer from "nodemailer";
import { getAppSettings } from "@/lib/settings";

export type OutgoingMail = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

export type MailProvider = "zeabur" | "smtp";

/** Zeabur Email 的送信端點是固定值，不開放設定以免變成 SSRF 的出口。 */
const ZEABUR_EMAIL_ENDPOINT = "https://api.zeabur.com/api/v1/zsend/emails";
const ZEABUR_TIMEOUT_MS = 20000;

export class MailNotConfiguredError extends Error {
  constructor() {
    super("尚未設定寄信服務");
    this.name = "MailNotConfiguredError";
  }
}

function normalizeProvider(value: string | undefined): MailProvider {
  return value?.trim().toLowerCase() === "smtp" ? "smtp" : "zeabur";
}

/**
 * 從「顯示名稱 <a@b.c>」取出純信箱。
 * Zeabur 的 from 欄位在文件裡是純信箱，送顯示名稱格式可能被拒絕。
 */
export function bareAddress(value: string) {
  const match = value.match(/<([^>]+)>/);
  return (match ? match[1] : value).trim();
}

async function mailConfig() {
  const settings = await getAppSettings();
  const provider = normalizeProvider(settings.MAIL_PROVIDER);
  const from = settings.MAIL_FROM?.trim() || "";
  if (!from) return null;

  if (provider === "zeabur") {
    const apiKey = settings.ZEABUR_EMAIL_API_KEY?.trim() || "";
    if (!apiKey) return null;
    return { provider, from, apiKey } as const;
  }

  const host = settings.SMTP_HOST?.trim() || "";
  const user = settings.SMTP_USER?.trim() || "";
  const password = settings.SMTP_PASSWORD?.trim() || "";
  const port = Number(settings.SMTP_PORT?.trim() || 587);
  if (!host || !user || !password || !Number.isFinite(port) || port <= 0) return null;
  return { provider, from, host, port, user, password } as const;
}

/** /forgot-password 用它決定要顯示「已寄出」還是「請聯絡管理員」。 */
export async function isMailerConfigured() {
  return (await mailConfig()) !== null;
}

async function sendViaZeabur(config: { from: string; apiKey: string }, mail: OutgoingMail) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ZEABUR_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(ZEABUR_EMAIL_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        from: bareAddress(config.from),
        to: [mail.to],
        subject: mail.subject,
        html: mail.html,
        text: mail.text
      }),
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    // 回應內容可能含帳務/網域細節，只留在伺服器日誌，不往上拋給使用者。
    const detail = await response.text().catch(() => "");
    throw new Error(`Zeabur Email 寄送失敗 (${response.status})：${detail.slice(0, 300)}`);
  }
}

async function sendViaSmtp(
  config: { from: string; host: string; port: number; user: string; password: string },
  mail: OutgoingMail
) {
  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    // 465 是隱式 TLS；587／2525 先明文再 STARTTLS 升級。
    secure: config.port === 465,
    requireTLS: config.port !== 465,
    auth: { user: config.user, pass: config.password },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000
  });

  try {
    await transport.sendMail({
      from: config.from,
      to: mail.to,
      subject: mail.subject,
      text: mail.text,
      html: mail.html
    });
  } finally {
    transport.close();
  }
}

export async function sendMail(mail: OutgoingMail) {
  const config = await mailConfig();
  if (!config) throw new MailNotConfiguredError();
  if (config.provider === "zeabur") return sendViaZeabur(config, mail);
  return sendViaSmtp(config, mail);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function passwordResetMail(to: string, resetUrl: string, expiresInMinutes: number): OutgoingMail {
  const safeUrl = escapeHtml(resetUrl);
  return {
    to,
    subject: "重設你的 lurevid 密碼",
    text: [
      "我們收到重設 lurevid 密碼的請求。",
      "",
      `請在 ${expiresInMinutes} 分鐘內開啟以下連結設定新密碼：`,
      resetUrl,
      "",
      "這個連結只能使用一次。如果不是你本人操作，請忽略這封信，你的密碼不會有任何變動。"
    ].join("\n"),
    html: [
      '<div style="font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',sans-serif;line-height:1.7;color:#1a1a1a">',
      "<p>我們收到重設 lurevid 密碼的請求。</p>",
      `<p>請在 <strong>${expiresInMinutes} 分鐘</strong>內點擊下面的按鈕設定新密碼：</p>`,
      `<p><a href="${safeUrl}" style="display:inline-block;background:#ff6b2c;color:#fff;padding:12px 22px;border-radius:999px;text-decoration:none">重設密碼</a></p>`,
      `<p style="font-size:12px;color:#666">按鈕無法點擊的話，請複製這個網址：<br>${safeUrl}</p>`,
      '<p style="font-size:12px;color:#666">這個連結只能使用一次。如果不是你本人操作，請忽略這封信，你的密碼不會有任何變動。</p>',
      "</div>"
    ].join("")
  };
}
