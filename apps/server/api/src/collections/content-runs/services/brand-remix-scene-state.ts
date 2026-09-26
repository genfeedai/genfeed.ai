import { createHash, randomUUID } from 'node:crypto';
import type {
  BrandRemixConcept,
  BrandRemixRunConfig,
} from '@genfeedai/contracts/api-types/contracts/brand-remix-run.contract';
import type {
  BrandRemixScenePipeline,
  BrandRemixSceneQuote,
} from '@genfeedai/contracts/api-types/contracts/brand-remix-scene.contract';
import { ConflictException } from '@nestjs/common';

export const UNSUPPORTED_SCENE_STRICT_FIDELITY =
  'Strict fidelity is not supported by the selected generation path. Use Guided fidelity instead.';

export function initialScenePipeline(): BrandRemixScenePipeline {
  return {
    version: 1,
    language: 'en',
    state: 'awaiting_analysis',
    cancellationGeneration: 0,
    scenes: {},
    receipts: [],
    replacedAssetIds: [],
  };
}

export function assertSupportedSceneFidelity(
  config: BrandRemixRunConfig,
): void {
  assertSceneBriefFidelity(config.draft.fidelityMode);
}

export function assertSceneBriefFidelity(fidelityMode: string): void {
  if (fidelityMode === 'strict') {
    throw new ConflictException(UNSUPPORTED_SCENE_STRICT_FIDELITY);
  }
}
export function stableSceneConcept(
  concept: BrandRemixConcept,
): BrandRemixConcept {
  return {
    ...concept,
    storyboard: concept.storyboard.map((scene, index) => ({
      ...scene,
      id: scene.id ?? randomUUID(),
      ordinal: index + 1,
    })),
  };
}
export function sceneInputHash(config: BrandRemixRunConfig): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        draft: config.draft,
        concept: config.concept,
        source: config.sourceSnapshot,
        analysisSource: config.analysisSource,
      }),
    )
    .digest('hex');
}
export function assertSceneQuote(
  config: BrandRemixRunConfig,
  quote: BrandRemixSceneQuote,
  now = Date.now(),
): void {
  if (
    quote.revision !== config.revision ||
    quote.inputHash !== sceneInputHash(config) ||
    Date.parse(quote.expiresAt) <= now
  )
    throw new ConflictException(
      'The scene quote expired or the remix changed. Request a new quote.',
    );
}
export function assertScenePlan(config: BrandRemixRunConfig): void {
  const scenes = config.concept?.storyboard ?? [];
  if (scenes.length < 2 || scenes.length > 6)
    throw new ConflictException('Scene generation requires 2–6 scenes.');
  if (
    !['video', 'avatar'].includes(config.draft.output.kind) ||
    config.draft.output.count !== 1 ||
    !('aspectRatio' in config.draft.output) ||
    !['9:16', '16:9', '1:1'].includes(config.draft.output.aspectRatio)
  )
    throw new ConflictException('Select one video in 9:16, 16:9, or 1:1.');
  const ids = new Set<string>();
  const observations = scenes
    .flatMap((scene) =>
      scene.sourceObservation ? [scene.sourceObservation] : [],
    )
    .sort((a, b) => a.startSeconds - b.startSeconds);
  if (
    observations.some(
      (item, index) =>
        item.sourceAssetId !== config.scenePipeline?.analysis?.sourceAssetId ||
        (index > 0 && item.startSeconds < observations[index - 1].endSeconds),
    )
  )
    throw new ConflictException(
      'Source observations must use the analyzed video without overlap.',
    );
  for (const [index, scene] of scenes.entries()) {
    if (!scene.id || ids.has(scene.id) || scene.ordinal !== index + 1)
      throw new ConflictException(
        'Scenes require unique IDs and contiguous ordinals.',
      );
    ids.add(scene.id);
    if (
      !scene.durationSeconds ||
      scene.durationSeconds < 3 ||
      scene.durationSeconds > 15
    )
      throw new ConflictException('Plan 3–15 seconds for each scene.');
    const words = scene.narration?.trim().split(/\s+/).length ?? 0;
    if (!words || words > scene.durationSeconds * 4)
      throw new ConflictException(
        'Each scene needs original narration bounded to its planned duration.',
      );
    const identity = scene.identity ?? config.draft.identity;
    if (!('avatarAssetId' in identity))
      throw new ConflictException(
        'Assign a saved avatar and voice to every speaking scene.',
      );
    const observation = scene.sourceObservation;
    if (observation) {
      if (
        observation.endSeconds >
        (config.scenePipeline?.analysis?.durationSeconds ?? 60)
      )
        throw new ConflictException(
          'Source observations must be ordered and within the source duration.',
        );
    }
  }
}
export function assertOriginalNarration(
  transcript: string,
  narration: string,
): void {
  const normalize = (value: string) =>
    value
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter(Boolean);
  const source = normalize(transcript);
  const output = normalize(narration);
  const windows = new Set(
    source
      .slice(0, -8)
      .map((_, index) => source.slice(index, index + 9).join(' ')),
  );
  if (
    output
      .slice(0, -8)
      .some((_, index) => windows.has(output.slice(index, index + 9).join(' ')))
  )
    throw new ConflictException(
      'Rewrite the narration: more than eight consecutive source words were copied.',
    );
}
export function isSceneOperationActive(
  pipeline: BrandRemixScenePipeline | undefined,
): boolean {
  return Boolean(
    pipeline &&
      ['analysing', 'generating', 'assembling'].includes(pipeline.state),
  );
}
export function invalidateScenePipeline(
  previous: BrandRemixRunConfig,
  next: BrandRemixRunConfig,
): BrandRemixScenePipeline | undefined {
  const pipeline = previous.scenePipeline;
  if (!pipeline) return undefined;
  const visualInputs = (config: BrandRemixRunConfig) => ({
    identity: config.draft.identity,
    references: config.draft.references,
    output: config.draft.output,
    target: config.draft.target,
  });
  const draftChanged =
    JSON.stringify(visualInputs(previous)) !==
    JSON.stringify(visualInputs(next));
  const before = new Map(
    previous.concept?.storyboard.map((scene) => [scene.id, scene]),
  );
  const retained: BrandRemixScenePipeline['scenes'] = {};
  const replaced = [...pipeline.replacedAssetIds];
  for (const scene of next.concept?.storyboard ?? []) {
    if (!scene.id) continue;
    const old = before.get(scene.id);
    const saved = pipeline.scenes[scene.id];
    if (!saved || !old) continue;
    const visualChanged =
      draftChanged ||
      scene.visualIntent !== old.visualIntent ||
      JSON.stringify(scene.identity) !== JSON.stringify(old.identity);
    const narrationChanged =
      scene.narration !== old.narration ||
      scene.durationSeconds !== old.durationSeconds;
    if (visualChanged || narrationChanged) {
      const invalidated = [
        visualChanged ? saved.image.assetId : undefined,
        saved.video.assetId,
      ].filter((value): value is string => Boolean(value));
      retained[scene.id] = {
        ...saved,
        image: visualChanged
          ? { attempt: saved.image.attempt + 1, state: 'pending' }
          : saved.image,
        video: { attempt: saved.video.attempt + 1, state: 'pending' },
        actualDurationSeconds: undefined,
        replacedAssetIds: [...saved.replacedAssetIds, ...invalidated],
      };
    } else retained[scene.id] = saved;
  }
  for (const [sceneId, scene] of Object.entries(pipeline.scenes))
    if (!retained[sceneId])
      replaced.push(
        ...[scene.image.assetId, scene.video.assetId].filter(
          (value): value is string => Boolean(value),
        ),
      );
  for (const assetId of [
    pipeline.assembly?.assetId,
    pipeline.assembly?.mergedAssetId,
  ])
    if (assetId) replaced.push(assetId);
  return {
    ...pipeline,
    state:
      pipeline.analysis?.rewrite.state === 'ready'
        ? 'storyboard'
        : 'awaiting_analysis',
    quote: undefined,
    operation: undefined,
    assembly: undefined,
    error: undefined,
    scenes: retained,
    replacedAssetIds: [...new Set(replaced)],
  };
}

/** A claim older than this cannot belong to a live step and may be reconciled. */
export const STALE_SCENE_CLAIM_MS = 2 * 60_000;
/** An active operation whose run was not written for this long lost its step chain. */
export const STALLED_SCENE_CHAIN_MS = 5 * 60_000;
type SceneStage = BrandRemixScenePipeline['scenes'][string]['image'];

export function isStaleSceneClaim(stage: SceneStage, now = Date.now()) {
  return (
    stage.state === 'claimed' &&
    (!stage.claimedAt ||
      now - Date.parse(stage.claimedAt) > STALE_SCENE_CLAIM_MS)
  );
}

/**
 * Synchronous platform calls (Whisper, OpenRouter) have no upstream job to
 * adopt. Their accepted attempt may run again under the same idempotent
 * reservation key once no live step can still hold the claim.
 */
export function isRetryableSyncSceneStage(stage: SceneStage, now = Date.now()) {
  return (
    stage.state === 'pending' ||
    stage.state === 'uncertain' ||
    isStaleSceneClaim(stage, now)
  );
}

export function hasInFlightSceneGeneration(
  pipeline: BrandRemixScenePipeline | undefined,
): boolean {
  return Object.values(pipeline?.scenes ?? {}).some((scene) =>
    [scene.image, scene.video].some((stage) =>
      ['claimed', 'submitted'].includes(stage.state),
    ),
  );
}

export function canResumeScenePipeline(
  pipeline: BrandRemixScenePipeline | undefined,
  lastWrittenAt: Date,
  now = Date.now(),
): boolean {
  if (!pipeline?.operation) return false;
  if (['partial_failure', 'cancelled'].includes(pipeline.state)) return true;
  return (
    isSceneOperationActive(pipeline) &&
    now - lastWrittenAt.getTime() > STALLED_SCENE_CHAIN_MS
  );
}

export function hasUnreconciledSceneWork(
  pipeline: BrandRemixScenePipeline | undefined,
): boolean {
  if (!pipeline) return false;
  const stages = Object.values(pipeline.scenes).flatMap((scene) => [
    scene.image,
    scene.video,
  ]);
  if (pipeline.analysis)
    stages.push(pipeline.analysis.transcription, pipeline.analysis.rewrite);
  if (pipeline.assembly) stages.push(pipeline.assembly.transcription);
  return stages.some((stage) =>
    ['claimed', 'submitted', 'uncertain'].includes(stage.state),
  );
}
