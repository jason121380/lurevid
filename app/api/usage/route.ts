import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, isResponse } from "@/lib/authz";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OPENAI_TEXT_INPUT_PER_M = 0.75;
const OPENAI_TEXT_OUTPUT_PER_M = 4.5;
const OPENAI_TRANSCRIBE_PER_MINUTE = 0.006;
const OPENAI_IMAGE_TEXT_INPUT_PER_M = 5;
const OPENAI_IMAGE_OUTPUT_PER_M = 30;

const IMAGE_OUTPUT_TOKEN_ESTIMATE = 4096;
const DEFAULT_SOURCE_SECONDS = 30;

function textTokens(value?: string | null) {
  if (!value) return 0;
  return Math.ceil(value.length / 1.6);
}

function sourceSeconds(frameCount: number, hasTranscript: boolean) {
  if (frameCount > 0) return Math.max(3, frameCount * 3);
  return hasTranscript ? DEFAULT_SOURCE_SECONDS : 0;
}

function seedanceCostForDuration(duration: number) {
  if (duration <= 4) return 0.39;
  if (duration >= 15) return 0.86;
  return 0.39 + ((duration - 4) / 11) * (0.86 - 0.39);
}

function roundMoney(value: number) {
  return Math.round(value * 10000) / 10000;
}

export async function GET() {
  const admin = await requireAdmin();
  if (isResponse(admin)) return admin;

  const projects = await prisma.project.findMany({
    include: { scenes: true },
    orderBy: { updatedAt: "desc" }
  });

  let textInputTokens = 0;
  let textOutputTokens = 0;
  let transcribeMinutes = 0;
  let imageInputTokens = 0;
  let imageOutputTokens = 0;

  let transcribeJobs = 0;
  let analysisJobs = 0;
  let adaptJobs = 0;
  let storyboardPromptJobs = 0;
  let storyboardImages = 0;
  let seedanceVideos = 0;
  let seedanceSeconds = 0;
  let seedanceCost = 0;

  for (const project of projects) {
    const frames = Array.isArray(project.sourceFrameUrls) ? project.sourceFrameUrls.length : 0;
    const transcriptTokens = textTokens(project.sourceTranscript);
    const visualTokens = textTokens(project.visualAnalysis);
    const analysisTokens = textTokens(project.analysis);
    const structureTokens = textTokens(project.structure);
    const adaptedTokens = textTokens(project.adaptedScript);

    if (project.sourceTranscript) {
      transcribeJobs += 1;
      transcribeMinutes += sourceSeconds(frames, true) / 60;
    }

    if (project.visualAnalysis) {
      analysisJobs += 1;
      textInputTokens += transcriptTokens + frames * 300 + 800;
      textOutputTokens += visualTokens;
    }

    if (project.analysis) {
      analysisJobs += 1;
      textInputTokens += transcriptTokens + visualTokens + 1000;
      textOutputTokens += analysisTokens;
    }

    if (project.structure) {
      textInputTokens += transcriptTokens + analysisTokens + 800;
      textOutputTokens += structureTokens;
    }

    if (project.adaptedScript) {
      adaptJobs += 1;
      textInputTokens += analysisTokens + structureTokens + 800;
      textOutputTokens += adaptedTokens;
    }

    if (project.scenes.length > 0) {
      storyboardPromptJobs += 1;
      const promptOutputTokens = project.scenes.reduce(
        (sum, scene) => sum + textTokens(scene.title) + textTokens(scene.visualGoal) + textTokens(scene.imagePrompt) + textTokens(scene.seedancePrompt),
        0
      );
      textInputTokens += adaptedTokens + 1000;
      textOutputTokens += promptOutputTokens;
    }

    const generatedImages = project.scenes.filter((scene) => scene.imageUrl).length;
    storyboardImages += generatedImages;
    imageInputTokens += project.scenes.filter((scene) => scene.imageUrl).reduce((sum, scene) => sum + textTokens(scene.imagePrompt), 0);
    imageOutputTokens += generatedImages * IMAGE_OUTPUT_TOKEN_ESTIMATE;

    if (project.finalVideoUrl) {
      const duration = project.duration || 5;
      seedanceVideos += 1;
      seedanceSeconds += duration;
      seedanceCost += seedanceCostForDuration(duration);
    }
  }

  const textCost = (textInputTokens / 1_000_000) * OPENAI_TEXT_INPUT_PER_M + (textOutputTokens / 1_000_000) * OPENAI_TEXT_OUTPUT_PER_M;
  const transcribeCost = transcribeMinutes * OPENAI_TRANSCRIBE_PER_MINUTE;
  const imageCost = (imageInputTokens / 1_000_000) * OPENAI_IMAGE_TEXT_INPUT_PER_M + (imageOutputTokens / 1_000_000) * OPENAI_IMAGE_OUTPUT_PER_M;
  const openaiCost = textCost + transcribeCost + imageCost;

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    note: "此頁依專案資料與官方公開單價推估，不等於供應商實際帳單。OpenAI 未保存實際 token usage，Seedance 以完成影片數與 duration 估算。",
    totals: {
      projects: projects.length,
      completedProjects: projects.filter((project) => project.status === "COMPLETED").length,
      estimatedCostUsd: roundMoney(openaiCost + seedanceCost)
    },
    openai: {
      jobs: {
        transcribe: transcribeJobs,
        analysis: analysisJobs,
        adapt: adaptJobs,
        storyboardPrompts: storyboardPromptJobs,
        storyboardImages
      },
      usage: {
        textInputTokens,
        textOutputTokens,
        transcribeMinutes: Math.round(transcribeMinutes * 10) / 10,
        imageInputTokens,
        imageOutputTokens
      },
      estimatedCostUsd: roundMoney(openaiCost),
      breakdown: {
        textUsd: roundMoney(textCost),
        transcribeUsd: roundMoney(transcribeCost),
        imageUsd: roundMoney(imageCost)
      }
    },
    seedance: {
      jobs: {
        completedVideos: seedanceVideos
      },
      usage: {
        outputSeconds: seedanceSeconds
      },
      estimatedCostUsd: roundMoney(seedanceCost)
    },
    pricing: {
      openai: {
        text: "gpt-5.4-mini standard: input $0.75 / 1M tokens, output $4.50 / 1M tokens",
        image: "gpt-image-2 standard: text input $5 / 1M tokens, image output $30 / 1M tokens",
        transcribe: "gpt-4o-transcribe: $0.006 / minute"
      },
      seedance: "Dreamina Seedance 2.0: public pricing range $0.39-$0.86 / video; estimate interpolates by duration"
    }
  });
}
