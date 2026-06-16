import { prisma } from "@/lib/prisma";

export type StepKey =
  | "source"
  | "transcribe"
  | "frames"
  | "analyze"
  | "structure"
  | "adapt"
  | "storyboard"
  | "mergeStoryboard"
  | "video";

export type StepStatus = "idle" | "running" | "done" | "failed";
export type StepState = { status: StepStatus; progress: number; message?: string };

/** 合併更新某步驟在 Project.steps（JSON）的狀態。每個專案一次只跑一個 job，read-modify-write 安全。 */
export async function setStep(projectId: string, key: StepKey, state: Partial<StepState>) {
  const row = await prisma.project.findUnique({ where: { id: projectId }, select: { steps: true } });
  const steps = { ...((row?.steps as Record<string, StepState>) || {}) };
  const prev = steps[key] || { status: "idle", progress: 0 };
  steps[key] = { ...prev, ...state } as StepState;
  await prisma.project.update({ where: { id: projectId }, data: { steps } });
}

export const markStepRunning = (projectId: string, key: StepKey, progress = 0.1) =>
  setStep(projectId, key, { status: "running", progress, message: undefined });

export const markStepDone = (projectId: string, key: StepKey) =>
  setStep(projectId, key, { status: "done", progress: 1, message: undefined });

export const markStepFailed = (projectId: string, key: StepKey, message: string) =>
  setStep(projectId, key, { status: "failed", progress: 1, message });
