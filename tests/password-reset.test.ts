import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn()
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    passwordResetToken: { findUnique: mocks.findUnique }
  }
}));

import { createResetToken, findUsableResetToken, resetUrlFor } from "@/lib/password-reset";

const ORIGINAL_URL = process.env.NEXTAUTH_URL;

beforeEach(() => {
  mocks.findUnique.mockReset();
  process.env.NEXTAUTH_URL = "https://lurevid.example.com";
});

afterEach(() => {
  if (ORIGINAL_URL === undefined) delete process.env.NEXTAUTH_URL;
  else process.env.NEXTAUTH_URL = ORIGINAL_URL;
});

describe("reset token generation", () => {
  it("stores only a sha256 hash, never the token itself", () => {
    const { token, tokenHash } = createResetToken();
    expect(tokenHash).toBe(createHash("sha256").update(token).digest("hex"));
    expect(tokenHash).not.toContain(token);
  });

  it("never repeats a token", () => {
    const tokens = new Set(Array.from({ length: 200 }, () => createResetToken().token));
    expect(tokens.size).toBe(200);
  });
});

describe("reset link", () => {
  it("is built from the server's own NEXTAUTH_URL, not a request header", () => {
    const url = new URL(resetUrlFor("abc123"));
    expect(url.origin).toBe("https://lurevid.example.com");
    expect(url.pathname).toBe("/reset-password");
    expect(url.searchParams.get("token")).toBe("abc123");
  });

  it("percent-encodes the token so it survives the query string", () => {
    expect(resetUrlFor("a+b/c=d")).toContain("token=a%2Bb%2Fc%3Dd");
  });

  it("refuses to build a link when NEXTAUTH_URL is missing", () => {
    delete process.env.NEXTAUTH_URL;
    delete process.env.AUTH_URL;
    expect(() => resetUrlFor("abc")).toThrow(/NEXTAUTH_URL/);
  });
});

describe("reset token validation", () => {
  const base = {
    id: "token-1",
    userId: "user-1",
    tokenHash: "hash",
    usedAt: null as Date | null,
    expiresAt: new Date(Date.now() + 60_000),
    createdAt: new Date(),
    user: { id: "user-1", email: "someone@example.com" }
  };

  it("accepts a fresh, unused token", async () => {
    mocks.findUnique.mockResolvedValue(base);
    await expect(findUsableResetToken("raw")).resolves.toMatchObject({ id: "token-1" });
  });

  it("rejects an empty token without touching the database", async () => {
    await expect(findUsableResetToken("")).resolves.toBeNull();
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });

  it("rejects an unknown token", async () => {
    mocks.findUnique.mockResolvedValue(null);
    await expect(findUsableResetToken("raw")).resolves.toBeNull();
  });

  it("rejects a token that was already used", async () => {
    mocks.findUnique.mockResolvedValue({ ...base, usedAt: new Date() });
    await expect(findUsableResetToken("raw")).resolves.toBeNull();
  });

  it("rejects an expired token", async () => {
    mocks.findUnique.mockResolvedValue({ ...base, expiresAt: new Date(Date.now() - 1000) });
    await expect(findUsableResetToken("raw")).resolves.toBeNull();
  });

  it("looks the token up by its hash, not by the raw value", async () => {
    mocks.findUnique.mockResolvedValue(base);
    await findUsableResetToken("raw-token");
    const where = mocks.findUnique.mock.calls[0][0].where;
    expect(where.tokenHash).toBe(createHash("sha256").update("raw-token").digest("hex"));
    expect(JSON.stringify(where)).not.toContain("raw-token");
  });
});
