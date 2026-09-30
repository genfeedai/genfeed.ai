import {
  type StoryboardStoredRunConfig,
  storyboardLegacyState,
  storyboardStoredRunConfigSchema,
} from '@api/collections/content-runs/services/storyboard-imported-run-state.schema';
import type { StoryboardPlan } from '@genfeedai/contracts/api-types/contracts/storyboard-plan.contract';
import {
  storyboardImportedPlanSchema,
  storyboardPlanSchema,
} from '@genfeedai/contracts/api-types/contracts/storyboard-plan.contract';
import { BadRequestException, ConflictException } from '@nestjs/common';

/** Duration choices come from the resolved model, never a UI sample. Lower wins ties. */
export function snapStoryboardDurations(
  plan: StoryboardPlan,
  supported: readonly number[],
): StoryboardPlan {
  const choices = [...new Set(supported)]
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b);
  if (!choices.length)
    throw new ConflictException(
      'The selected video model has no supported duration contract.',
    );
  const shots = plan.shots.map((shot) => ({
    ...shot,
    durationSeconds:
      shot.durationSeconds === null
        ? null
        : choices.reduce((nearest, value) =>
            Math.abs(value - (shot.durationSeconds ?? 0)) <
            Math.abs(nearest - (shot.durationSeconds ?? 0))
              ? value
              : nearest,
          ),
  }));
  const result = storyboardImportedPlanSchema.safeParse({ ...plan, shots });
  if (!result.success)
    throw new BadRequestException(
      result.error.issues.map((issue) => issue.message).join('; '),
    );
  return result.data;
}

export type StoryboardEditableConfig = StoryboardStoredRunConfig & {
  plan: StoryboardPlan;
};
export function assertStoryboardPlan(
  config: StoryboardStoredRunConfig,
): asserts config is StoryboardEditableConfig {
  if (!config.plan)
    throw new ConflictException('STORYBOARD_MIGRATION_REVIEW_REQUIRED');
}

export function assertStoryboardEditable(
  config: StoryboardStoredRunConfig,
): void {
  const legacy = storyboardLegacyState(config);
  const pipeline = config.scenePipeline ?? legacy?.scenePipeline;
  const stages = Object.values(pipeline?.scenes ?? {}).flatMap((scene) => [
    scene.image,
    scene.video,
  ]);
  const analysis = pipeline?.analysis;
  if (analysis) stages.push(analysis.transcription, analysis.rewrite);
  if (
    ['analysing', 'generating', 'assembling'].includes(config.state) ||
    legacy?.generationClaim ||
    legacy?.paidDraftOperation ||
    legacy?.reviewClaim?.status === 'claimed' ||
    legacy?.execution?.variants.some((variant) =>
      ['queued', 'processing'].includes(variant.status),
    ) ||
    stages.some((stage) =>
      ['claimed', 'submitted', 'uncertain'].includes(stage.state),
    ) ||
    pipeline?.receipts.some((receipt) =>
      ['reserved', 'uncertain'].includes(receipt.state),
    )
  ) {
    throw new ConflictException(
      'Cancel and reconcile accepted storyboard work before editing.',
    );
  }
}

/** Submitted asset/freshness changes never manufacture a fresh generated still. */
export function editStoryboardPlan(
  config: StoryboardStoredRunConfig,
  submitted: StoryboardPlan,
): StoryboardEditableConfig {
  assertStoryboardEditable(config);
  const styleChanged =
    config.plan?.styleLabel !== submitted.styleLabel ||
    JSON.stringify(config.plan?.styleReferenceAssetIds) !==
      JSON.stringify(submitted.styleReferenceAssetIds);
  const previous = new Map(
    (config.plan?.shots ?? []).map((shot) => [shot.id, shot]),
  );
  const plan = (
    config.origin === 'migrated'
      ? storyboardImportedPlanSchema
      : storyboardPlanSchema
  ).parse({
    ...submitted,
    shots: submitted.shots.map((shot) => {
      const old = previous.get(shot.id);
      const conditioning = (value: StoryboardPlan, id: string) => {
        const prompt = storyboardShotPrompt(value, id);
        return {
          referenceAssetIds: prompt.referenceAssetIds,
          avatarAssetId: prompt.avatarAssetId,
        };
      };
      const castChanged = Boolean(
        old &&
          config.plan &&
          JSON.stringify(conditioning(config.plan, old.id)) !==
            JSON.stringify(conditioning(submitted, shot.id)),
      );
      const stale = styleChanged || castChanged || old?.action !== shot.action;
      return {
        ...shot,
        stillAssetId: old?.stillAssetId,
        stillFreshness: old?.stillAssetId
          ? stale
            ? 'stale'
            : old.stillFreshness
          : 'missing',
      };
    }),
  });
  return storyboardStoredRunConfigSchema.parse({
    ...config,
    plan,
    revision: config.revision + 1,
    approvedRevision: undefined,
    quote: undefined,
    state: 'storyboard',
    error: undefined,
  }) as StoryboardEditableConfig;
}

export function assertStoryboardComplete(plan: StoryboardPlan): void {
  if (
    plan.runtimeBudgetSeconds === null ||
    plan.shots.length < 2 ||
    plan.shots.some((shot) => !shot.action || shot.durationSeconds === null)
  )
    throw new ConflictException(
      'Choose a runtime and complete 2–12 shots before approval or generation.',
    );
}

export function approveStoryboardPlan(
  config: StoryboardStoredRunConfig,
): StoryboardEditableConfig {
  assertStoryboardEditable(config);
  assertStoryboardPlan(config);
  if (
    config.origin === 'migrated' &&
    config.migrationReview.status === 'required'
  )
    throw new ConflictException('STORYBOARD_MIGRATION_REVIEW_REQUIRED');
  assertStoryboardComplete(config.plan);
  const invalid = config.plan.shots.filter(
    (shot) =>
      shot.stillFreshness !== 'fresh' ||
      !shot.stillAssetId ||
      (shot.dialogue &&
        !config.plan.cast.find((member) => member.id === shot.speakerId)
          ?.voiceId),
  );
  if (invalid.length)
    throw new ConflictException(
      `Fresh stills and dialogue voice assignments are required for shots ${invalid.map((shot) => shot.ordinal).join(', ')}.`,
    );
  return {
    ...config,
    state: 'approved',
    approvedRevision: config.revision,
    quote: undefined,
  };
}

/** Only generation inputs: private notes and sections never enter provider prompts. */
export function storyboardShotPrompt(plan: StoryboardPlan, shotId: string) {
  const shot = plan.shots.find((value) => value.id === shotId);
  if (!shot) throw new BadRequestException('Shot not found.');
  const speaker = plan.cast.find((member) => member.id === shot.speakerId);
  return {
    action: shot.action,
    dialogue: shot.dialogue,
    durationSeconds: shot.durationSeconds,
    styleLabel: plan.styleLabel,
    referenceAssetIds: [
      ...new Set([
        ...plan.styleReferenceAssetIds,
        ...(speaker?.referenceAssetIds ?? []),
      ]),
    ],
    voiceId: speaker?.voiceId,
    avatarAssetId: shot.onScreenSpeaker ? speaker?.avatarAssetId : undefined,
    dialogueMode:
      shot.onScreenSpeaker && speaker?.avatarAssetId ? 'lip_sync' : 'voiceover',
  };
}
