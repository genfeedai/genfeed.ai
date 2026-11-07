import { storyboardConfigHash } from '@api/collections/content-runs/services/storyboard-config-hash';
import type {
  StoryboardPlan,
  StoryboardShot,
} from '@genfeedai/contracts/api-types/contracts/storyboard-plan.contract';
import { compileStoryboardShotPrompt } from '@genfeedai/contracts/api-types/contracts/storyboard-shot-prompt.contract';
import {
  type StoryboardShotRender,
  type StoryboardShotRenderStage,
  storyboardShotRenderSchema,
  storyboardShotRenderStageSchema,
} from '@genfeedai/contracts/api-types/contracts/storyboard-shot-render.contract';
import { z } from 'zod';

/**
 * Terminal operations beyond this are pruned oldest first. Live operations
 * and the latest render of each shot and stage are never pruned.
 */
export const SHOT_RENDER_JOURNAL_CAPACITY = 64;
/** A dispatch that left no placeholder for this long never reached a provider. */
export const SHOT_RENDER_ABANDONED_MS = 10 * 60_000;

export const shotRenderOperationSchema = z
  .object({
    version: z.literal(1),
    operationId: z.string().uuid(),
    shotId: z.string().min(1),
    stage: storyboardShotRenderStageSchema,
    actorUserId: z.string().min(1),
    modelKey: z.string().min(1),
    credits: z.number().finite().nonnegative(),
    billingMode: z.enum(['platform', 'byok']),
    /** The shot inputs the prompt and references were compiled from. */
    inputFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    prompt: z.string().min(1).max(8_000),
    referenceAssetIds: z.array(z.string().min(1)).max(20),
    aspectRatio: z.string().min(1),
    durationSeconds: z.number().finite().positive().max(60),
    resolution: z.string().min(1).optional(),
    isAudioEnabled: z.boolean(),
    promotedFromOperationId: z.string().uuid().optional(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    state: z.enum(['pending', 'submitted', 'ready', 'failed']),
    assetId: z.string().min(1).optional(),
    reservationId: z.string().min(1).optional(),
    billing: z.enum(['none', 'reserved', 'settled', 'released']),
    errorCode: z.string().max(200).optional(),
  })
  .strict();
export const shotRenderJournalSchema = z
  .array(shotRenderOperationSchema)
  .max(SHOT_RENDER_JOURNAL_CAPACITY);
export type ShotRenderOperation = z.infer<typeof shotRenderOperationSchema>;

export function isLiveShotRenderOperation(op: ShotRenderOperation): boolean {
  return op.state === 'pending' || op.state === 'submitted';
}

function slotKey(op: Pick<ShotRenderOperation, 'shotId' | 'stage'>): string {
  return `${op.shotId}:${op.stage}`;
}

/** The newest operation of each shot and stage, in journal order. */
export function latestShotRenderOperations(
  journal: readonly ShotRenderOperation[],
): Map<string, ShotRenderOperation> {
  const latest = new Map<string, ShotRenderOperation>();
  for (const op of journal) latest.set(slotKey(op), op);
  return latest;
}

/** The newest operation for one shot and stage. */
export function latestShotRender(
  journal: readonly ShotRenderOperation[] | undefined,
  shotId: string,
  stage: ShotRenderOperation['stage'],
): ShotRenderOperation | undefined {
  return latestShotRenderOperations(journal ?? []).get(
    slotKey({ shotId, stage }),
  );
}

/**
 * Appends operations, dropping the oldest terminal ones that are no longer
 * the latest render of a shot and stage in the plan. The latest render of a
 * shot the plan no longer has is prunable like any older render.
 */
export function appendShotRenderOperations(
  journal: readonly ShotRenderOperation[],
  added: readonly ShotRenderOperation[],
  planShotIds: ReadonlySet<string>,
): ShotRenderOperation[] {
  const next = [...journal, ...added];
  const latest = new Set(
    [...latestShotRenderOperations(next).values()].filter((op) =>
      planShotIds.has(op.shotId),
    ),
  );
  let excess = next.length - SHOT_RENDER_JOURNAL_CAPACITY;
  return next.filter((op) => {
    if (excess <= 0 || isLiveShotRenderOperation(op) || latest.has(op)) {
      return true;
    }
    excess -= 1;
    return false;
  });
}

/**
 * Identifies the shot inputs a render of one stage is compiled from:
 * everything that can enter its prompt or references, and the chosen video
 * model, since the draft model is its cheaper sibling. Only the final follows
 * the shot length: a draft always renders the shortest clip. Notes and the
 * transition are left out: they change the edit, not the clip.
 */
export function shotRenderInputFingerprint(
  plan: StoryboardPlan,
  shot: StoryboardShot,
  stage: StoryboardShotRenderStage,
): string {
  const compiled = compileStoryboardShotPrompt(plan, shot, {
    isAudioEnabled: true,
    maxReferences: Number.MAX_SAFE_INTEGER,
  });
  return storyboardConfigHash({
    prompt: compiled.prompt,
    references: compiled.referenceAssetIds,
    format: plan.format,
    videoModelKey: plan.videoModelKey ?? undefined,
    durationSeconds:
      stage === 'final' ? (shot.durationSeconds ?? undefined) : undefined,
  });
}

/**
 * The clip length a model renders for a shot: the shortest supported length
 * that covers the shot, else the longest one.
 */
export function snapShotRenderDuration(
  seconds: number,
  durations: readonly number[],
): number | undefined {
  const sorted = [...durations].sort((a, b) => a - b);
  return sorted.find((value) => value >= seconds) ?? sorted.at(-1);
}

/** The latest draft and final of each shot, for the public run. */
export function projectShotRenders(
  plan: StoryboardPlan,
  journal: readonly ShotRenderOperation[] | undefined,
): StoryboardShotRender[] | undefined {
  if (!journal?.length) return undefined;
  const shots = new Map(plan.shots.map((shot) => [shot.id, shot]));
  const renders = [...latestShotRenderOperations(journal).values()].flatMap(
    (op) => {
      const shot = shots.get(op.shotId);
      if (!shot) return [];
      return [
        storyboardShotRenderSchema.parse({
          operationId: op.operationId,
          shotId: op.shotId,
          stage: op.stage,
          modelKey: op.modelKey,
          state: op.state,
          assetId: op.assetId,
          credits: op.credits,
          billingMode: op.billingMode,
          prompt: op.prompt,
          referenceAssetIds: op.referenceAssetIds,
          durationSeconds: op.durationSeconds,
          resolution: op.resolution,
          isAudioEnabled: op.isAudioEnabled,
          promotedFromOperationId: op.promotedFromOperationId,
          isCurrent:
            op.inputFingerprint ===
            shotRenderInputFingerprint(plan, shot, op.stage),
          errorCode: op.errorCode,
          updatedAt: op.updatedAt,
        }),
      ];
    },
  );
  return renders.length ? renders : undefined;
}
