import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  settings: {} as Record<string, string>
}));

vi.mock("@/lib/settings", () => ({
  getAppSettings: vi.fn(async () => mocks.settings)
}));

const sendMailSpy = vi.hoisted(() => vi.fn(async () => undefined));
// 參數要標型別，測試才能讀 mock.calls[n][0] 檢查 transport 選項。
const createTransportSpy = vi.hoisted(() =>
  vi.fn((options: Record<string, unknown>) => ({ options, sendMail: sendMailSpy, close: vi.fn() }))
);

vi.mock("nodemailer", () => ({
  default: { createTransport: createTransportSpy }
}));

import { bareAddress, isMailerConfigured, passwordResetMail, sendMail } from "@/lib/mailer";

const ZEABUR_SETTINGS = {
  MAIL_PROVIDER: "zeabur",
  MAIL_FROM: "lurevid <no-reply@lurevid.app>",
  ZEABUR_EMAIL_API_KEY: "zeabur-secret-key"
};

const mail = { to: "user@example.com", subject: "主旨", text: "純文字", html: "<p>HTML</p>" };

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  mocks.settings = {};
  sendMailSpy.mockClear();
  createTransportSpy.mockClear();
  fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("bareAddress", () => {
  it("extracts the address out of a display-name form", () => {
    expect(bareAddress("lurevid <no-reply@lurevid.app>")).toBe("no-reply@lurevid.app");
  });

  it("leaves a plain address alone", () => {
    expect(bareAddress("  no-reply@lurevid.app ")).toBe("no-reply@lurevid.app");
  });
});

describe("mailer configuration", () => {
  it("is unconfigured when nothing is filled in", async () => {
    await expect(isMailerConfigured()).resolves.toBe(false);
  });

  it("needs an API key for the zeabur provider", async () => {
    mocks.settings = { MAIL_PROVIDER: "zeabur", MAIL_FROM: "a@b.c" };
    await expect(isMailerConfigured()).resolves.toBe(false);
    mocks.settings = ZEABUR_SETTINGS;
    await expect(isMailerConfigured()).resolves.toBe(true);
  });

  it("does not treat zeabur credentials as enough for smtp", async () => {
    mocks.settings = { ...ZEABUR_SETTINGS, MAIL_PROVIDER: "smtp" };
    await expect(isMailerConfigured()).resolves.toBe(false);
  });

  it("defaults to zeabur when the provider is unset", async () => {
    mocks.settings = { MAIL_FROM: "a@b.c", ZEABUR_EMAIL_API_KEY: "k" };
    await expect(isMailerConfigured()).resolves.toBe(true);
  });
});

describe("zeabur transport", () => {
  beforeEach(() => {
    mocks.settings = ZEABUR_SETTINGS;
  });

  it("posts the documented request shape", async () => {
    await sendMail(mail);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.zeabur.com/api/v1/zsend/emails");
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(init.headers.Authorization).toBe("Bearer zeabur-secret-key");

    expect(JSON.parse(init.body)).toEqual({
      from: "no-reply@lurevid.app",
      to: ["user@example.com"],
      subject: "主旨",
      html: "<p>HTML</p>",
      text: "純文字"
    });
  });

  it("never sends over SMTP when zeabur is selected", async () => {
    await sendMail(mail);
    expect(createTransportSpy).not.toHaveBeenCalled();
  });

  it("throws on a non-2xx response without leaking the API key", async () => {
    fetchMock.mockResolvedValue(new Response("domain not verified", { status: 422 }));
    await expect(sendMail(mail)).rejects.toThrow(/422/);
    await expect(sendMail(mail)).rejects.not.toThrow(/zeabur-secret-key/);
  });
});

describe("smtp transport", () => {
  it("uses implicit TLS on 465 and requires STARTTLS elsewhere", async () => {
    const base = { MAIL_PROVIDER: "smtp", MAIL_FROM: "a@b.c", SMTP_HOST: "smtp.b.c", SMTP_USER: "u", SMTP_PASSWORD: "p" };

    mocks.settings = { ...base, SMTP_PORT: "465" };
    await sendMail(mail);
    expect(createTransportSpy.mock.calls[0][0]).toMatchObject({ secure: true, requireTLS: false });

    mocks.settings = { ...base, SMTP_PORT: "587" };
    await sendMail(mail);
    expect(createTransportSpy.mock.calls[1][0]).toMatchObject({ secure: false, requireTLS: true });

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("password reset mail", () => {
  it("escapes the reset url so a crafted token cannot inject markup", () => {
    const built = passwordResetMail("a@b.c", 'https://x.test/reset-password?token=a"><script>evil()</script>', 60);
    expect(built.html).not.toContain("<script>");
    expect(built.html).toContain("&lt;script&gt;");
  });

  it("keeps the raw link usable in the plain-text part", () => {
    const built = passwordResetMail("a@b.c", "https://x.test/reset-password?token=abc", 60);
    expect(built.text).toContain("https://x.test/reset-password?token=abc");
    expect(built.text).toContain("60 分鐘");
  });
});
