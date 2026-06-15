import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  user: null as null | { id: string; email: string; isAdmin: boolean },
  findFirst: vi.fn()
}));

vi.mock("@/lib/authz", () => ({
  currentUser: vi.fn(async () => mocks.user)
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: {
      findFirst: mocks.findFirst
    }
  }
}));

const { loadOwnedProject } = await import("@/lib/project-access");

describe("loadOwnedProject", () => {
  beforeEach(() => {
    mocks.user = { id: "user_1", email: "owner@example.com", isAdmin: false };
    mocks.findFirst.mockReset();
  });

  it("returns 401 when no user is logged in", async () => {
    mocks.user = null;
    const result = await loadOwnedProject("project_1");
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(401);
  });

  it("queries by id and userId at the database layer", async () => {
    mocks.findFirst.mockResolvedValueOnce({ id: "project_1", userId: "user_1" });
    const result = await loadOwnedProject("project_1");
    expect(mocks.findFirst).toHaveBeenCalledWith({ where: { id: "project_1", userId: "user_1" } });
    expect(result).toEqual({
      user: { id: "user_1", email: "owner@example.com", isAdmin: false },
      project: { id: "project_1", userId: "user_1" }
    });
  });

  it("returns 404 when no owned project is found", async () => {
    mocks.findFirst.mockResolvedValueOnce(null);
    const result = await loadOwnedProject("project_2");
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(404);
  });
});

