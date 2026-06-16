import { describe, expect, it } from "vitest";
import { createStoryboardBeats } from "@/lib/openai";

describe("storyboard script parsing", () => {
  it("uses a 9-grid adapted script directly as storyboard beats", async () => {
    const script = JSON.stringify({
      scenes: Array.from({ length: 9 }, (_, index) => ({
        sceneNumber: index + 1,
        title: `第 ${index + 1} 格`,
        visualGoal: `第 ${index + 1} 格的畫面目標`
      }))
    });

    await expect(createStoryboardBeats(script)).resolves.toEqual(
      Array.from({ length: 9 }, (_, index) => ({
        sceneNumber: index + 1,
        title: `第 ${index + 1} 格`,
        visualGoal: `第 ${index + 1} 格的畫面目標`
      }))
    );
  });
});
