import nodemailer from "nodemailer";
import { getAppSettings } from "@/lib/settings";

export type OutgoingMail = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

/**
 * 寄信目前只走 SMTP。之後要接 REST API 的寄信服務時，
 * 在 sendMail 裡多一個分支即可，呼叫端不用改。
 */
async function smtpConfig() {
  const settings = await getAppSettings();
  const host = settings.SMTP_HOST?.trim() || "";
  const user = settings.SMTP_USER?.trim() || "";
  const password = settings.SMTP_PASSWORD?.trim() || "";
  const from = settings.MAIL_FROM?.trim() || "";
  const port = Number(settings.SMTP_PORT?.trim() || 587);
  if (!host || !user || !password || !from || !Number.isFinite(port) || port <= 0) return null;
  return { host, port, user, password, from };
}

/** /forgot-password 用它決定要顯示「已寄出」還是「請聯絡管理員」。 */
export async function isMailerConfigured() {
  return (await smtpConfig()) !== null;
}

export class MailNotConfiguredError extends Error {
  constructor() {
    super("尚未設定寄信服務");
    this.name = "MailNotConfiguredError";
  }
}

export async function sendMail(mail: OutgoingMail) {
  const config = await smtpConfig();
  if (!config) throw new MailNotConfiguredError();

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
