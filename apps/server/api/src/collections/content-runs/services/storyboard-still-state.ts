import { storyboardConfigHash } from '@api/collections/content-runs/services/storyboard-config-hash';
import type { StoryboardPlan } from '@genfeedai/contracts/api-types/contracts/storyboard-plan.contract';
import { DRAFT_GENERATION_CONFIG } from '@genfeedai/contracts/constants';
import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';

/** Terminal operations beyond this are pruned oldest first; live ones never are. */
export const STILL_JOURNAL_CAPACITY = 64;
/** A dispatch that left no placeholder for this long never reached a provider. */
export const STILL_ABANDONED_MS = 5 * 60_000;

export const stillOperationSchema = z
  .object({
    version: z.literal(1),
    operationId: z.string().uuid(),
    shotId: z.string().min(1),
    actorUserId: z.string().min(1),
    modelKey: z.string().min(1),
    credits: z.number().finite().nonnegative(),
    billingMode: z.enum(['platform', 'byok']),
    fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    prompt: z.string().min(1),
    referenceAssetIds: z
      .array(z.string().min(1))
      .max(DRAFT_GENERATION_CONFIG.maxReferences),
    aspectRatio: z.string().min(1),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    state: z.enum(['pending', 'submitted', 'ready', 'failed']),
    assetId: z.string().min(1).optional(),
    reservationId: z.string().min(1).optional(),
    billing: z.enum(['none', 'reserved', 'settled', 'released']),
    errorCode: z.string().max(200).optional(),
  })
  .strict();
export const stillJournalSchema = z
  .array(stillOperationSchema)
  .max(STILL_JOURNAL_CAPACITY);
export type StillOperation = z.infer<typeof stillOperationSchema>;

export function isLiveStillOperation(op: StillOperation): boolean {
  return op.state === 'pending' || op.state === 'submitted';
}

/** Appends operations, dropping the oldest terminal ones to stay in capacity. */
export function appendStillOperations(
  journal: readonly StillOperation[],
  added: readonly StillOperation[],
): StillOperation[] {
  const next = [...journal, ...added];
  let excess = next.length - STILL_JOURNAL_CAPACITY;
  return next.filter((op) => {
    if (excess <= 0 || isLiveStillOperation(op)) return true;
    excess -= 1;
    return false;
  });
}

function mentions(action: string, name: string): boolean {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(
    `(^|[^\\p{L}\\p{N}])${escaped}($|[^\\p{L}\\p{N}])`,
    'iu',
  ).test(action);
}

/**
 * The provider input for one shot's sketch still. Cast references come first
 * (the speaker, then members named in the action), then style references, up
 * to the draft model's reference limit. Notes, dialogue and the brand's colour
 * look never enter a draft prompt.
 */
export function storyboardStillInput(plan: StoryboardPlan, shotId: string) {
  const shot = plan.shots.find((value) => value.id === shotId);
  if (!shot) throw new BadRequestException('Shot not found.');
  const speaker = plan.cast.find((member) => member.id === shot.speakerId);
  const cast = [
    ...(speaker ? [speaker] : []),
    ...plan.cast.filter(
      (member) => member !== speaker && mentions(shot.action, member.name),
    ),
  ];
  const referenceAssetIds = [
    ...new Set([
      ...(shot.onScreenSpeaker && speaker?.avatarAssetId
        ? [speaker.avatarAssetId]
        : []),
      ...cast.flatMap((member) => member.referenceAssetIds),
      ...plan.styleReferenceAssetIds,
    ]),
  ].slice(0, DRAFT_GENERATION_CONFIG.maxReferences);
  // Names mean nothing to the image model; identity comes from the
  // references, so a speaker swap with the same images keeps the still fresh.
  const prompt = [
    shot.action.trim(),
    cast.some((member) => member.referenceAssetIds.length) ||
    referenceAssetIds.includes(speaker?.avatarAssetId ?? '')
      ? 'Keep every person consistent with the reference images.'
      : '',
    DRAFT_GENERATION_CONFIG.sketchStyle,
  ]
    .filter(Boolean)
    .join(' ');
  const input = {
    prompt,
    referenceAssetIds,
    aspectRatio: plan.format,
    modelKey: DRAFT_GENERATION_CONFIG.draftModelKey,
  };
  return { ...input, fingerprint: storyboardConfigHash(input) };
}
