import "dotenv/config";
import { bareAddress, sendMail } from "@/lib/mailer";
import { getAppSettings } from "@/lib/settings";
import { prisma } from "@/lib/prisma";

/**
 * 設定寄信服務後用來確認真的寄得出去：
 *
 *   npm run mail-test -- you@example.com
 *
 * 會用跟「忘記密碼」完全相同的設定與路徑寄一封測試信，
 * 失敗時把常見原因翻成看得懂的說明，而不是丟原始錯誤。
 */
function diagnose(message: string, from: string) {
  const text = message.toLowerCase();
  const domain = bareAddress(from).split("@")[1] || "（無法判讀）";

  if (/401|403|unauthorized|invalid api key|forbidden/.test(text)) {
    return [
      "API Key 被拒絕。請確認：",
      "  • 金鑰完整複製（Zeabur 只顯示一次，重看不到就重建一支）",
      "  • 權限至少是「僅發送」，「唯讀」不能寄信",
      "  • 如果建立金鑰時限制了網域，必須包含 " + domain
    ].join("\n");
  }
  if (/domain|not verified|unverified|422/.test(text)) {
    return [
      `寄件網域 ${domain} 還沒通過驗證。請確認：`,
      "  • Zeabur Email → 網域管理裡已經新增這個網域，且狀態是已驗證",
      "  • DKIM / SPF / DMARC 三筆 DNS 記錄都加好了",
      "  • MAIL_FROM 的網域跟驗證過的網域完全一致（子網域也算不同網域）"
    ].join("\n");
  }
  if (/quota|limit|429|exceeded/.test(text)) {
    return "已達寄信配額或速率上限，請看 Zeabur Email 的「配額與超額計費」。";
  }
  if (/enotfound|econnrefused|etimedout|timeout|fetch failed|abort/.test(text)) {
    return [
      "連不到寄信服務。請確認：",
      "  • 這台機器可以對外連網",
      "  • 若 MAIL_PROVIDER=smtp：多數雲端機房（含 Zeabur）會封鎖對外 SMTP 埠，",
      "    在 Zeabur 上請改用 MAIL_PROVIDER=zeabur"
    ].join("\n");
  }
  return "";
}

async function main() {
  const to = (process.argv[2] || "").trim();
  if (!to || !to.includes("@")) {
    console.error("用法：npm run mail-test -- <收件人 email>");
    process.exitCode = 1;
    return;
  }

  const settings = await getAppSettings();
  const provider = settings.MAIL_PROVIDER?.trim().toLowerCase() === "smtp" ? "smtp" : "zeabur";
  const from = settings.MAIL_FROM?.trim() || "";

  console.log("目前設定");
  console.log(`  寄信方式 : ${provider}`);
  console.log(`  寄件人   : ${from || "（未設定）"}`);
  if (provider === "zeabur") {
    console.log(`  API Key  : ${settings.ZEABUR_EMAIL_API_KEY ? "已設定" : "（未設定）"}`);
  } else {
    console.log(`  SMTP     : ${settings.SMTP_HOST || "（未設定）"}:${settings.SMTP_PORT || "587"}`);
    console.log(`  帳號     : ${settings.SMTP_USER || "（未設定）"}`);
  }
  console.log(`  收件人   : ${to}`);
  console.log("");

  if (!from) {
    console.error("MAIL_FROM 還沒設定，請先到 /settings 的「寄信」填寄件人。");
    process.exitCode = 1;
    return;
  }

  try {
    await sendMail({
      to,
      subject: "lurevid 寄信測試",
      text: "這是一封測試信。看到這封信代表 lurevid 的寄信設定正常，忘記密碼功能可以使用了。",
      html: '<div style="font-family:sans-serif;line-height:1.7"><p>這是一封測試信。</p><p>看到這封信代表 lurevid 的寄信設定正常，忘記密碼功能可以使用了。</p></div>'
    });
    console.log("✅ 已送出，請到收件匣（含垃圾郵件匣）確認。");
    console.log("   沒收到的話多半是網域驗證還沒生效，或被收件端擋掉。");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("❌ 寄送失敗");
    console.error("");
    const hint = diagnose(message, from);
    if (hint) {
      console.error(hint);
      console.error("");
    }
    console.error("原始錯誤：", message);
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error("測試寄信時發生預期外的錯誤：", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
