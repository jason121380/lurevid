import { describe, expect, it } from "vitest";
import { SeedanceApiError, seedanceUpstreamDetail, toSeedanceTaskCreationError } from "@/lib/seedance";

const REJECTED = new SeedanceApiError("InputImagesSensitiveContentDetected: input image may contain real person", 400);

describe("Seedance task errors", () => {
  it("fails instead of falling back when the reference image is rejected", () => {
    const mapped = toSeedanceTaskCreationError(REJECTED);

    expect(mapped).toBeInstanceOf(Error);
    expect((mapped as Error).message).toContain("內容審核判定參考圖含有真人");
  });

  it("tells the user which step to redo rather than only that it failed", () => {
    const message = (toSeedanceTaskCreationError(REJECTED) as Error).message;
    expect(message).toContain("第 6 步");
  });

  it("keeps the upstream wording out of the user-facing message", () => {
    const message = (toSeedanceTaskCreationError(REJECTED) as Error).message;
    expect(message).not.toContain("InputImagesSensitiveContentDetected");
  });

  it("still carries the upstream reason for the server log", () => {
    const mapped = toSeedanceTaskCreationError(REJECTED);
    expect(seedanceUpstreamDetail(mapped)).toBe(
      "[400] InputImagesSensitiveContentDetected: input image may contain real person"
    );
  });

  it("explains a 404 as a key/region/model problem and keeps the detail", () => {
    const notFound = new SeedanceApiError("model not found", 404);
    const mapped = toSeedanceTaskCreationError(notFound);
    expect((mapped as Error).message).toContain("ARK_API_KEY");
    expect(seedanceUpstreamDetail(mapped)).toBe("[404] model not found");
  });

  it("passes unrecognised errors through untouched", () => {
    const other = new SeedanceApiError("some other failure", 500);
    expect(toSeedanceTaskCreationError(other)).toBe(other);
    expect(seedanceUpstreamDetail(other)).toBe("[500] some other failure");
  });
});
