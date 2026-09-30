import {
  type StoryboardLegacyConfig,
  type StoryboardStoredRunConfig,
  storyboardLegacyConfigSchema,
  storyboardStoredRunConfigSchema,
} from '@api/collections/content-runs/services/storyboard-imported-run-state.schema';
import type { StoryboardMigrationIssue } from '@genfeedai/contracts/api-types/contracts/storyboard-migration.contract';
import {
  type StoryboardPlan,
  storyboardImportedPlanSchema,
} from '@genfeedai/contracts/api-types/contracts/storyboard-plan.contract';

export { storyboardConfigHash } from '@api/collections/content-runs/services/storyboard-config-hash';

import { storyboardConfigHash } from '@api/collections/content-runs/services/storyboard-config-hash';

export interface StoryboardMigrationRecord {
  id: string;
  organizationId: string;
  brandId: string;
  isDeleted: boolean;
  updatedAt: Date;
  config: unknown;
}
export interface StoryboardMigrationContext {
  organizationId: string;
  brandId: string;
  migratedAt: string;
  authorizedAssetIds: ReadonlySet<string>;
  verifiedStills?: ReadonlyMap<string, { assetId: string; inputHash: string }>;
}
export interface StoryboardMigrationReport {
  runId: string;
  sourceHash: string;
  destinationHash: string;
  preservationChecks: {
    originalArchiveUnchanged: boolean;
    creativeRevisionUnchanged: boolean;
    paidIdentitiesUnchanged: boolean;
  };
  issues: StoryboardMigrationIssue[];
}
export interface StoryboardMigrationResult {
  status: 'unchanged' | 'converted' | 'needs_review' | 'unsupported';
  config: unknown;
  report: StoryboardMigrationReport;
}
type LegacyScene = NonNullable<
  StoryboardLegacyConfig['concept']
>['storyboard'][number];

export function storyboardLegacySceneInputHash(
  config: StoryboardLegacyConfig,
  scene: LegacyScene,
): string {
  return storyboardConfigHash({
    sourceSnapshot: config.sourceSnapshot,
    output: config.draft.output,
    visualIntent: scene.visualIntent,
    narration: scene.narration ?? null,
    identity:
      scene.identity ??
      (scene.id
        ? config.scenePipeline?.scenes[scene.id]?.identity
        : undefined) ??
      config.draft.identity,
    references: config.draft.references,
    stageReferenceAssetIds: scene.id
      ? (config.scenePipeline?.scenes[scene.id]?.referenceAssetIds ?? [])
      : [],
  });
}

export function convertStoryboardRun(
  record: StoryboardMigrationRecord,
  context: StoryboardMigrationContext,
): StoryboardMigrationResult {
  const sourceHash = storyboardConfigHash(record.config);
  const issues: StoryboardMigrationIssue[] = [];
  const report: StoryboardMigrationReport = {
    runId: record.id,
    sourceHash,
    destinationHash: sourceHash,
    preservationChecks: {
      originalArchiveUnchanged: true,
      creativeRevisionUnchanged: true,
      paidIdentitiesUnchanged: true,
    },
    issues,
  };
  const unchanged = (
    status: StoryboardMigrationResult['status'],
  ): StoryboardMigrationResult => ({ status, config: record.config, report });
  if (
    record.isDeleted ||
    record.organizationId !== context.organizationId ||
    record.brandId !== context.brandId
  )
    return unchanged('unsupported');
  const current = storyboardStoredRunConfigSchema.safeParse(record.config);
  if (current.success) {
    if (
      current.data.origin === 'migrated' &&
      current.data.migration.sourceConfigHash !==
        storyboardConfigHash(current.data.importedState?.originalConfig)
    ) {
      issues.push({
        code: 'LEGACY_PLAN_UNREPRESENTABLE',
        path: 'migration.sourceConfigHash',
      });
      return unchanged('unsupported');
    }
    return unchanged('unchanged');
  }
  const parsed = storyboardLegacyConfigSchema.safeParse(record.config);
  if (!parsed.success) {
    issues.push({ code: 'LEGACY_PLAN_UNREPRESENTABLE', path: 'config' });
    return unchanged('unsupported');
  }
  const legacy = parsed.data;
  const original = record.config as StoryboardLegacyConfig;
  const scenes = [...(legacy.concept?.storyboard ?? [])].sort(
    (a, b) => a.ordinal - b.ordinal,
  );
  const pipeline = legacy.scenePipeline;
  const addIssue = (code: StoryboardMigrationIssue['code'], path: string) =>
    issues.push({ code, path });
  const paid = Boolean(
    pipeline?.operation || legacy.execution || legacy.generationClaim,
  );
  const identities = new Map<string, StoryboardPlan['cast'][number]>();
  const castFor = (scene: LegacyScene) => {
    const identity =
      scene.identity ??
      (scene.id ? pipeline?.scenes[scene.id]?.identity : undefined) ??
      ('avatarAssetId' in legacy.draft.identity
        ? legacy.draft.identity
        : undefined);
    if (!identity) return undefined;
    const pair = storyboardConfigHash(identity);
    if (!identities.has(pair))
      identities.set(pair, {
        id: `cast-${pair.slice(0, 24)}`,
        name: `Character ${identities.size + 1}`,
        voiceId: identity.speechVoiceId,
        avatarAssetId: context.authorizedAssetIds.has(identity.avatarAssetId)
          ? identity.avatarAssetId
          : undefined,
        referenceAssetIds: context.authorizedAssetIds.has(
          identity.avatarAssetId,
        )
          ? [identity.avatarAssetId]
          : [],
      });
    if (!context.authorizedAssetIds.has(identity.avatarAssetId))
      addIssue(
        'LEGACY_PLAN_UNREPRESENTABLE',
        `concept.storyboard.${scene.ordinal}.identity.avatarAssetId`,
      );
    return identities.get(pair)?.id;
  };
  const shots = scenes.map((scene) => {
    if (!scene.id && paid)
      addIssue(
        'LEGACY_STAGE_IDENTITY_MISSING',
        `concept.storyboard.${scene.ordinal}.id`,
      );
    const id =
      scene.id ??
      `shot-${storyboardConfigHash({ runId: record.id, sourceHash, ordinal: scene.ordinal }).slice(0, 32)}`;
    const stage = scene.id ? pipeline?.scenes[scene.id]?.image : undefined;
    const asset = stage?.assetId;
    const authorized =
      asset && context.authorizedAssetIds.has(asset) ? asset : undefined;
    if (asset && !authorized)
      addIssue(
        'LEGACY_PLAN_UNREPRESENTABLE',
        `scenePipeline.scenes.${id}.image.assetId`,
      );
    if ((scene.narration?.length ?? 0) > 500)
      addIssue(
        'LEGACY_DIALOGUE_TOO_LONG',
        `concept.storyboard.${scene.ordinal}.narration`,
      );
    const evidence = context.verifiedStills?.get(id);
    const speakerId = castFor(scene);
    return {
      id,
      ordinal: scene.ordinal,
      action: scene.visualIntent,
      dialogue: scene.narration,
      speakerId,
      onScreenSpeaker: Boolean(speakerId),
      durationSeconds: scene.durationSeconds ?? null,
      stillAssetId: authorized,
      stillFreshness: authorized
        ? stage?.state === 'ready' &&
          evidence?.assetId === authorized &&
          evidence.inputHash === storyboardLegacySceneInputHash(legacy, scene)
          ? ('fresh' as const)
          : ('stale' as const)
        : ('missing' as const),
      transition: 'cut' as const,
    };
  });
  const output = legacy.draft.output;
  const runtime =
    pipeline?.analysis?.durationSeconds ??
    ('durationSeconds' in output ? output.durationSeconds : undefined) ??
    (shots.length && shots.every((shot) => shot.durationSeconds !== null)
      ? shots.reduce((sum, shot) => sum + (shot.durationSeconds ?? 0), 0)
      : null);
  if (
    runtime !== null &&
    (runtime > 60 ||
      shots.reduce((sum, shot) => sum + (shot.durationSeconds ?? 0), 0) > 60)
  )
    addIssue('LEGACY_RUNTIME_EXCEEDED', 'draft.output.durationSeconds');
  if (identities.size > 6)
    addIssue('LEGACY_CAST_LIMIT_EXCEEDED', 'concept.storyboard.identity');
  if (!scenes.length || !['video', 'avatar'].includes(output.kind))
    addIssue('LEGACY_PLAN_UNREPRESENTABLE', 'draft.output.kind');
  const videoModelKey =
    pipeline?.quote?.items.find((line) => line.stage === 'video')?.model ??
    null;
  if (!videoModelKey) addIssue('LEGACY_MODEL_UNRESOLVED', 'plan.videoModelKey');
  if (
    pipeline?.operation &&
    (!pipeline.operation.userId ||
      pipeline.receipts.some(
        (receipt) =>
          ['reserved', 'uncertain'].includes(receipt.state) &&
          (!receipt.operationId ||
            !receipt.actorUserId ||
            (receipt.billingMode === 'platform' && !receipt.reservationId)),
      ))
  )
    addIssue('LEGACY_STAGE_IDENTITY_MISSING', 'scenePipeline.receipts');
  legacy.draft.references.forEach((reference, index) => {
    if (!context.authorizedAssetIds.has(reference.assetId))
      addIssue(
        'LEGACY_PLAN_UNREPRESENTABLE',
        `draft.references.${index}.assetId`,
      );
  });
  Object.entries(pipeline?.scenes ?? {}).forEach(([id, scene]) => {
    for (const stage of [scene.image, scene.video]) {
      if (
        (stage.state === 'claimed' && !stage.claimToken) ||
        (['submitted', 'uncertain'].includes(stage.state) && !stage.groupId)
      )
        addIssue('LEGACY_STAGE_IDENTITY_MISSING', `scenePipeline.scenes.${id}`);
    }
  });
  for (const scene of scenes) {
    const stage = scene.id ? pipeline?.scenes[scene.id] : undefined;
    const identity = scene.identity ?? stage?.identity ?? legacy.draft.identity;
    const representedReferences = new Set([
      ...legacy.draft.references.map((reference) => reference.assetId),
      ...('avatarAssetId' in identity ? [identity.avatarAssetId] : []),
    ]);
    if (stage?.referenceAssetIds.some((id) => !representedReferences.has(id)))
      addIssue(
        'LEGACY_PLAN_UNREPRESENTABLE',
        `scenePipeline.scenes.${scene.id}.referenceAssetIds`,
      );
  }
  const candidate = {
    title: legacy.sourceSnapshot.title,
    logline: legacy.concept?.hook ?? '',
    videoModelKey,
    format: 'aspectRatio' in output ? output.aspectRatio : '9:16',
    runtimeBudgetSeconds: runtime,
    styleReferenceAssetIds: legacy.draft.references
      .filter((reference) => context.authorizedAssetIds.has(reference.assetId))
      .map((reference) => reference.assetId),
    cast: [...identities.values()],
    shots,
  };
  const planResult = storyboardImportedPlanSchema.safeParse(candidate);
  const representationIssues =
    issues.some((issue) =>
      [
        'LEGACY_PLAN_UNREPRESENTABLE',
        'LEGACY_RUNTIME_EXCEEDED',
        'LEGACY_DIALOGUE_TOO_LONG',
        'LEGACY_CAST_LIMIT_EXCEEDED',
      ].includes(issue.code),
    ) || scenes.some((scene) => !scene.id && paid);
  if (!planResult.success && !representationIssues)
    addIssue('LEGACY_PLAN_UNREPRESENTABLE', 'plan');
  const plan =
    planResult.success && !representationIssues ? planResult.data : null;
  const outputAssetIds = [
    ...new Set(
      [
        ...(legacy.execution?.variants.flatMap((variant) => variant.assetIds) ??
          []),
        ...Object.values(pipeline?.scenes ?? {}).flatMap((scene) => [
          scene.image.assetId,
          scene.video.assetId,
          ...scene.replacedAssetIds,
        ]),
        ...(pipeline?.replacedAssetIds ?? []),
        pipeline?.assembly?.assetId,
        pipeline?.assembly?.mergedAssetId,
      ].filter(
        (id): id is string =>
          Boolean(id) && context.authorizedAssetIds.has(id as string),
      ),
    ),
  ];
  const stageStates = Object.values(pipeline?.scenes ?? {}).flatMap((scene) => [
    scene.image.state,
    scene.video.state,
  ]);
  const unresolved =
    stageStates.some((state) =>
      ['claimed', 'submitted', 'uncertain'].includes(state),
    ) ||
    pipeline?.receipts.some((receipt) =>
      ['reserved', 'uncertain'].includes(receipt.state),
    );
  const recover =
    pipeline?.operation &&
    (unresolved || !['ready', 'cancelled'].includes(pipeline.state));
  const activeConfig = structuredClone(original);
  const operation = activeConfig.scenePipeline?.operation;
  const migrationRecovery =
    recover && operation
      ? {
          operationId: operation.id,
          previousSequence: operation.sequence,
          nextSequence: operation.sequence + 1,
          jobId: `storyboard-${record.id}-${operation.id}-${operation.sequence + 1}`,
          state: 'pending' as const,
        }
      : undefined;
  if (migrationRecovery && operation)
    operation.sequence = migrationRecovery.nextSequence;
  const config: StoryboardStoredRunConfig =
    storyboardStoredRunConfigSchema.parse({
      contract: 'storyboard-run',
      version: 1,
      origin: 'migrated',
      revision: legacy.revision,
      clientRequestId: null,
      createdByUserId: null,
      submittedInputHash: null,
      state:
        pipeline?.state ??
        ([
          'ready_for_review',
          'in_review',
          'approved',
          'paid_draft_ready',
        ].includes(legacy.phase)
          ? 'ready'
          : 'storyboard'),
      sourceSnapshot: legacy.sourceSnapshot,
      plan,
      migration: {
        version: 1,
        sourceContract: 'brand-remix-run',
        sourceVersion: 1,
        sourceConfigHash: sourceHash,
        migratedAt: context.migratedAt,
        converterVersion: 1,
      },
      migrationReview: { status: issues.length ? 'required' : 'clear', issues },
      importedPresentation: {
        title: legacy.sourceSnapshot.title,
        outputKind: output.kind,
        shots: scenes.map((scene, index) => ({
          id: scene.id ?? (paid ? null : shots[index].id),
          ordinal: scene.ordinal,
          action: scene.visualIntent,
          dialogue: scene.narration ?? null,
          durationSeconds: scene.durationSeconds ?? null,
          stillAssetId: shots[index].stillAssetId ?? null,
        })),
        outputAssetIds,
      },
      importedState: { version: 1, originalConfig: original, activeConfig },
      migrationRecovery,
    });
  report.destinationHash = storyboardConfigHash(config);
  report.preservationChecks.originalArchiveUnchanged =
    storyboardConfigHash(config.importedState?.originalConfig) === sourceHash;
  report.preservationChecks.creativeRevisionUnchanged =
    config.revision === legacy.revision;
  const activeEvidence = structuredClone(config.importedState?.activeConfig);
  if (
    activeEvidence?.scenePipeline?.operation &&
    original.scenePipeline?.operation
  )
    activeEvidence.scenePipeline.operation.sequence =
      original.scenePipeline.operation.sequence;
  report.preservationChecks.paidIdentitiesUnchanged =
    storyboardConfigHash(
      activeEvidence ?? config.importedState?.originalConfig,
    ) === sourceHash;
  return {
    status: issues.length ? 'needs_review' : 'converted',
    config,
    report,
  };
}
