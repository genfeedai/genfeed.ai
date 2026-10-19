import {
  type StoryboardStoredRunConfig,
  storyboardStoredRunConfigSchema,
} from '@api/collections/content-runs/services/storyboard-imported-run-state.schema';
import { storyboardStillInput } from '@api/collections/content-runs/services/storyboard-still-state';
import {
  type StoryboardPlan,
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
  const result = storyboardPlanSchema.safeParse({ ...plan, shots });
  if (!result.success)
    throw new BadRequestException(
      result.error.issues.map((issue) => issue.message).join('; '),
    );
  return result.data;
}

type StoryboardPipeline = StoryboardStoredRunConfig['scenePipeline'];

/** True while a stage, receipt or assembly job on the scene pipeline is still in flight. */
function storyboardPipelineHasAcceptedWork(
  pipeline: StoryboardPipeline,
): boolean {
  const scenes = Object.values(pipeline?.scenes ?? {});
  const stages = [
    ...scenes.flatMap((scene) => [scene.image, scene.video]),
    ...(pipeline?.analysis
      ? [pipeline.analysis.transcription, pipeline.analysis.rewrite]
      : []),
    ...(pipeline?.assembly ? [pipeline.assembly.transcription] : []),
  ];
  return (
    stages.some(
      (stage) =>
        ['claimed', 'submitted', 'uncertain'].includes(stage.state) ||
        Boolean(stage.groupId && !stage.assetId && stage.state !== 'ready'),
    ) ||
    Boolean(
      (pipeline?.assembly?.mergeJobId && !pipeline.assembly.mergedAssetId) ||
        (pipeline?.assembly?.captionJobId && !pipeline.assembly.assetId),
    ) ||
    Boolean(
      pipeline?.receipts.some((receipt) =>
        ['reserved', 'uncertain'].includes(receipt.state),
      ),
    )
  );
}

export function assertStoryboardEditable(
  config: StoryboardStoredRunConfig,
): void {
  if (
    ['analysing', 'generating', 'assembling'].includes(config.state) ||
    storyboardPipelineHasAcceptedWork(config.scenePipeline)
  ) {
    throw new ConflictException(
      'Cancel and reconcile accepted storyboard work before editing.',
    );
  }
}

/**
 * Submitted asset/freshness changes never manufacture a fresh generated still.
 * Stills are server-owned: a still being generated stays `generating` across
 * edits, and its job decides fresh or stale when it lands.
 */
export function editStoryboardPlan(
  config: StoryboardStoredRunConfig,
  submitted: StoryboardPlan,
): StoryboardStoredRunConfig {
  assertStoryboardEditable(config);
  const styleChanged =
    config.plan.styleLabel !== submitted.styleLabel ||
    JSON.stringify(config.plan.styleReferenceAssetIds) !==
      JSON.stringify(submitted.styleReferenceAssetIds);
  const previous = new Map(config.plan.shots.map((shot) => [shot.id, shot]));
  const plan = storyboardPlanSchema.parse({
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
          JSON.stringify(conditioning(config.plan, old.id)) !==
            JSON.stringify(conditioning(submitted, shot.id)),
      );
      const stillInputChanged = Boolean(
        old &&
          storyboardStillInput(config.plan, old.id).fingerprint !==
            storyboardStillInput(submitted, shot.id).fingerprint,
      );
      const stale =
        styleChanged ||
        castChanged ||
        stillInputChanged ||
        old?.action !== shot.action;
      return {
        ...shot,
        stillAssetId: old?.stillAssetId,
        stillFreshness:
          old?.stillFreshness === 'generating'
            ? 'generating'
            : old?.stillAssetId
              ? stale
                ? 'stale'
                : old.stillFreshness
              : old?.stillFreshness === 'failed' && !stale
                ? 'failed'
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
  });
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
): StoryboardStoredRunConfig {
  assertStoryboardEditable(config);
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
