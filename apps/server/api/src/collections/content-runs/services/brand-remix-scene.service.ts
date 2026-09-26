import { randomUUID } from 'node:crypto';
import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { BrandRemixSceneQuoteService } from '@api/collections/content-runs/services/brand-remix-scene-quote.service';
import { BrandRemixSceneSourceService } from '@api/collections/content-runs/services/brand-remix-scene-source.service';
import {
  assertSceneQuote,
  assertSupportedSceneFidelity,
  canResumeScenePipeline,
  hasInFlightSceneGeneration,
  hasUnreconciledSceneWork,
  initialScenePipeline,
  isSceneOperationActive,
  isStaleSceneClaim,
  stableSceneConcept,
} from '@api/collections/content-runs/services/brand-remix-scene-state';
import { BrandRemixSceneStoreService } from '@api/collections/content-runs/services/brand-remix-scene-store.service';
import { BrandRemixSceneWorkflowService } from '@api/collections/content-runs/services/brand-remix-scene-workflow.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import type { RequestWithContext } from '@api/common/middleware/request-context.middleware';
import type {
  BrandRemixRunConfig,
  BrandRemixRunView,
} from '@genfeedai/contracts/api-types/contracts/brand-remix-run.contract';
import {
  attachBrandRemixAnalysisSourceSchema,
  type BrandRemixScenePipeline,
  brandRemixSceneIdentitySchema,
  controlBrandRemixScenesSchema,
  executeBrandRemixScenesSchema,
  quoteBrandRemixScenesSchema,
} from '@genfeedai/contracts/api-types/contracts/brand-remix-scene.contract';
import { LLM_DEFAULTS } from '@genfeedai/contracts/constants';
import { ConflictException, Injectable } from '@nestjs/common';

type SceneStage = BrandRemixScenePipeline['scenes'][string]['image'];

@Injectable()
export class BrandRemixSceneService {
  constructor(
    private readonly store: BrandRemixSceneStoreService,
    private readonly quotes: BrandRemixSceneQuoteService,
    private readonly source: BrandRemixSceneSourceService,
    private readonly workflow: BrandRemixSceneWorkflowService,
    private readonly credits: CreditsUtilsService,
  ) {}
  private editable(config: BrandRemixRunConfig) {
    if (
      config.review ||
      config.reviewClaim ||
      [
        'in_review',
        'approved',
        'paid_draft_creating',
        'paid_draft_ready',
      ].includes(config.phase)
    )
      throw new ConflictException('Reviewed remix output is immutable.');
    if (isSceneOperationActive(config.scenePipeline))
      throw new ConflictException(
        'Cancel or finish the active scene operation first.',
      );
  }
  async attachSource(
    organizationId: string,
    runId: string,
    user: AuthenticatedUser,
    body: unknown,
  ): Promise<BrandRemixRunView> {
    const input = attachBrandRemixAnalysisSourceSchema.parse(body);
    const { config, brandId } = await this.store.read(
      organizationId,
      runId,
      input.expectedRevision,
    );
    this.editable(config);
    const pipeline = config.scenePipeline;
    const stages = Object.values(pipeline?.scenes ?? {}).flatMap((scene) => [
      scene.image,
      scene.video,
    ]);
    if (pipeline?.assembly) stages.push(pipeline.assembly.transcription);
    if (pipeline?.analysis)
      stages.push(pipeline.analysis.transcription, pipeline.analysis.rewrite);
    if (
      stages.some((stage) =>
        ['claimed', 'submitted', 'uncertain'].includes(stage.state),
      )
    )
      throw new ConflictException(
        'Reconcile accepted or uncertain provider work before replacing the analysis source.',
      );
    const asset = input.assetId
      ? await this.source.libraryAsset(organizationId, brandId, input.assetId)
      : undefined;
    if (
      asset &&
      config.analysisSource?.assetId === asset.sourceAssetId &&
      config.analysisSource.assetUpdatedAt === asset.assetUpdatedAt
    )
      return this.store.view(organizationId, runId);
    const replacedAssetIds = [
      ...(pipeline?.replacedAssetIds ?? []),
      ...Object.values(pipeline?.scenes ?? {}).flatMap((scene) => [
        scene.image.assetId,
        scene.video.assetId,
      ]),
      pipeline?.assembly?.assetId,
      pipeline?.assembly?.mergedAssetId,
    ].filter((id): id is string => Boolean(id));
    await this.store.save(organizationId, runId, config, {
      ...config,
      revision: config.revision + 1,
      generationQuote: undefined,
      phase: 'prefilled',
      execution: undefined,
      analysisSource: asset
        ? {
            assetId: asset.sourceAssetId,
            assetUpdatedAt: asset.assetUpdatedAt,
            selectedByUserId: user.userId,
            selectedAt: new Date().toISOString(),
            selection: 'brand_library',
            purpose: 'analysis_only',
          }
        : undefined,
      concept: config.concept
        ? {
            ...config.concept,
            storyboard: config.concept.storyboard.map(
              ({ sourceObservation: _observation, ...scene }) => scene,
            ),
          }
        : undefined,
      scenePipeline: {
        ...initialScenePipeline(),
        cancellationGeneration: (pipeline?.cancellationGeneration ?? 0) + 1,
        receipts: pipeline?.receipts ?? [],
        replacedAssetIds: [...new Set(replacedAssetIds)],
      },
    });
    return this.store.view(organizationId, runId);
  }
  async quote(
    organizationId: string,
    runId: string,
    _user: AuthenticatedUser,
    body: unknown,
  ): Promise<BrandRemixRunView> {
    const input = quoteBrandRemixScenesSchema.parse(body);
    const { config, brandId } = await this.store.read(
      organizationId,
      runId,
      input.expectedRevision,
    );
    this.editable(config);
    assertSupportedSceneFidelity(config);
    if (hasUnreconciledSceneWork(config.scenePipeline))
      throw new ConflictException(
        'Resume or cancel the accepted scene work before requesting another quote.',
      );
    const next = {
      ...config,
      ...(config.concept
        ? { concept: stableSceneConcept(config.concept) }
        : {}),
      scenePipeline: config.scenePipeline ?? initialScenePipeline(),
    };
    const quote = await this.quotes.build(organizationId, brandId, next, input);
    await this.store.save(organizationId, runId, config, {
      ...next,
      scenePipeline: { ...next.scenePipeline, quote, state: 'quoted' },
    });
    return this.store.view(organizationId, runId);
  }
  async execute(
    organizationId: string,
    runId: string,
    user: AuthenticatedUser,
    _request: RequestWithContext,
    body: unknown,
  ): Promise<BrandRemixRunView> {
    const input = executeBrandRemixScenesSchema.parse(body);
    const { config, brandId } = await this.store.read(
      organizationId,
      runId,
      input.expectedRevision,
    );
    const pipeline = config.scenePipeline;
    if (pipeline?.operation?.quoteId === input.quoteId)
      return this.store.view(organizationId, runId);
    this.editable(config);
    assertSupportedSceneFidelity(config);
    const quote = pipeline?.quote;
    if (!pipeline || !quote || quote.id !== input.quoteId)
      throw new ConflictException('Accept a current scene quote first.');
    assertSceneQuote(config, quote);
    const fresh = await this.quotes.build(organizationId, brandId, config, {
      expectedRevision: config.revision,
      operation: quote.operation,
      sceneId: quote.sceneId,
      repairStage: quote.repairStage,
    });
    if (
      fresh.total !== quote.total ||
      JSON.stringify(fresh.items) !== JSON.stringify(quote.items)
    )
      throw new ConflictException(
        'Pricing or billing mode changed. Request a new quote.',
      );
    if (
      quote.total > 0 &&
      !(await this.credits.checkOrganizationCreditsAvailable(
        organizationId,
        quote.total,
      ))
    )
      throw new ConflictException(
        'Insufficient available credits for the complete accepted quote.',
      );
    const operation = {
      id: randomUUID(),
      quoteId: quote.id,
      revision: config.revision,
      cancellationGeneration: pipeline.cancellationGeneration,
      startedAt: new Date().toISOString(),
      userId: user.userId,
      sequence: 0,
    };
    const next = structuredClone(pipeline);
    next.operation = operation;
    next.error = undefined;
    if (quote.operation === 'analysis') {
      const source = await this.source.prepare(organizationId, brandId, config);
      next.state = 'analysing';
      next.analysis = {
        sourceAssetId: source.sourceAssetId,
        durationSeconds: source.durationSeconds,
        sizeBytes: source.sizeBytes,
        model: LLM_DEFAULTS.background,
        transcript: pipeline.analysis?.transcript,
        srt: pipeline.analysis?.srt,
        transcription: pipeline.analysis?.transcript
          ? { ...pipeline.analysis.transcription, state: 'ready' }
          : {
              attempt:
                quote.items.find((item) => item.stage === 'transcription')
                  ?.attempt ?? 1,
              state: 'pending',
            },
        rewrite: {
          attempt:
            quote.items.find((item) => item.stage === 'analysis')?.attempt ?? 1,
          state: 'pending',
        },
        keyframes: [],
        vendorCostKnown: false,
      };
    } else {
      next.state = 'generating';
      if (next.assembly?.assetId)
        next.replacedAssetIds.push(next.assembly.assetId);
      next.assembly = undefined;
      for (const scene of config.concept?.storyboard ?? []) {
        if (!scene.id) throw new ConflictException('Missing scene ID.');
        const identity = brandRemixSceneIdentitySchema.parse(
          scene.identity ?? config.draft.identity,
        );
        if (!('avatarAssetId' in identity))
          throw new ConflictException('Select an avatar and voice.');
        const saved = next.scenes[scene.id];
        const image = quote.items.find(
          (line) => line.sceneId === scene.id && line.stage === 'image',
        );
        const video = quote.items.find(
          (line) => line.sceneId === scene.id && line.stage === 'video',
        );
        const replacedAssetIds = [
          ...(saved?.replacedAssetIds ?? []),
          ...(image && saved?.image.assetId ? [saved.image.assetId] : []),
          ...(video && saved?.video.assetId ? [saved.video.assetId] : []),
        ];
        next.scenes[scene.id] = {
          identity,
          referenceAssetIds: config.draft.references.map(
            (reference) => reference.assetId,
          ),
          image: image
            ? {
                attempt: image.attempt,
                state: 'pending',
                groupId: `remix-${runId}-${scene.id}-image-${operation.id}`,
              }
            : (saved?.image ?? { attempt: 1, state: 'pending' }),
          video: video
            ? {
                attempt: video.attempt,
                state: 'pending',
                groupId: `remix-${runId}-${scene.id}-video-${operation.id}`,
              }
            : (saved?.video ?? { attempt: 1, state: 'pending' }),
          actualDurationSeconds: video
            ? undefined
            : saved?.actualDurationSeconds,
          replacedAssetIds,
        };
      }
    }
    await this.store.save(organizationId, runId, config, {
      ...config,
      phase: 'generating',
      execution: undefined,
      scenePipeline: next,
    });
    await this.workflow.enqueue(organizationId, runId, operation);
    return this.store.view(organizationId, runId);
  }
  async cancel(
    organizationId: string,
    runId: string,
    body: unknown,
  ): Promise<BrandRemixRunView> {
    const input = controlBrandRemixScenesSchema.parse(body);
    const { config } = await this.store.read(
      organizationId,
      runId,
      input.expectedRevision,
    );
    const pipeline = config.scenePipeline;
    if (
      config.review ||
      config.reviewClaim ||
      [
        'in_review',
        'approved',
        'paid_draft_creating',
        'paid_draft_ready',
      ].includes(config.phase)
    )
      throw new ConflictException('Reviewed remix output is immutable.');
    if (pipeline?.operation && pipeline.state === 'cancelled') {
      // Re-trigger reconciliation of accepted provider work whose chain
      // stopped; this never claims or dispatches anything new.
      if (!hasInFlightSceneGeneration(pipeline))
        throw new ConflictException('No scene operation is running.');
      const operation = {
        ...pipeline.operation,
        sequence: pipeline.operation.sequence + 1,
      };
      await this.store.save(organizationId, runId, config, {
        ...config,
        scenePipeline: { ...pipeline, operation },
      });
      await this.workflow.enqueue(organizationId, runId, operation);
      return this.store.view(organizationId, runId);
    }
    if (
      !pipeline?.operation ||
      !(
        isSceneOperationActive(pipeline) || pipeline.state === 'partial_failure'
      )
    )
      throw new ConflictException('No scene operation is running.');
    const operation = {
      ...pipeline.operation,
      sequence: pipeline.operation.sequence + 1,
    };
    const { next, released } = this.abandonSyncStages(runId, pipeline);
    await this.store.save(organizationId, runId, config, {
      ...config,
      phase: config.phase === 'generating' ? 'prefilled' : config.phase,
      scenePipeline: {
        ...next,
        operation,
        state: 'cancelled',
        cancellationGeneration: pipeline.cancellationGeneration + 1,
        error:
          'Future dispatch is cancelled. Already accepted provider work may still finish and is recorded.',
      },
    });
    // Holds are returned only after the cancellation is durable, so a lost
    // compare-and-swap never leaves a released hold behind a live receipt.
    for (const receipt of released)
      await this.credits.releaseReservation({
        organizationId,
        ...(receipt.reservationId
          ? { reservationId: receipt.reservationId }
          : { idempotencyKey: receipt.key }),
      });
    // Provider work accepted before cancellation keeps being reconciled so
    // its output and cost are recorded and the storyboard becomes editable.
    if (hasInFlightSceneGeneration(pipeline))
      await this.workflow.enqueue(organizationId, runId, operation, 10_000);
    return this.store.view(organizationId, runId);
  }
  /**
   * Synchronous platform stages whose call already ended in an uncertain
   * error, or whose step died long ago, have no upstream job to reconcile.
   * Cancelling marks them failed and returns their holds so the run can be
   * edited or quoted again. A claim that may still be live is left alone.
   */
  private abandonSyncStages(
    runId: string,
    pipeline: BrandRemixScenePipeline,
  ): {
    next: BrandRemixScenePipeline;
    released: BrandRemixScenePipeline['receipts'];
  } {
    const operationId = pipeline.operation?.id;
    const keys: string[] = [];
    const abandon = (
      stage: SceneStage,
      quoteStage: 'transcription' | 'analysis' | 'captions',
    ): SceneStage => {
      const isAbandoned =
        stage.state === 'uncertain' || isStaleSceneClaim(stage);
      if (!isAbandoned) return stage;
      const line = pipeline.quote?.items.find(
        (item) => item.stage === quoteStage && item.attempt === stage.attempt,
      );
      if (line && operationId)
        keys.push(`remix-${runId}-${operationId}-${line.key}`);
      return {
        ...stage,
        state: 'failed',
        error: 'Cancelled before this platform step completed.',
      };
    };
    const next = structuredClone(pipeline);
    if (next.analysis) {
      next.analysis.transcription = abandon(
        next.analysis.transcription,
        'transcription',
      );
      next.analysis.rewrite = abandon(next.analysis.rewrite, 'analysis');
    }
    if (next.assembly)
      next.assembly.transcription = abandon(
        next.assembly.transcription,
        'captions',
      );
    const released: BrandRemixScenePipeline['receipts'] = [];
    for (const key of keys) {
      const receipt = next.receipts.find(
        (candidate) => candidate.key === key && candidate.state === 'reserved',
      );
      if (!receipt) continue;
      if (receipt.amount > 0) released.push({ ...receipt });
      receipt.state = 'released';
    }
    return { next, released };
  }
  async resume(
    organizationId: string,
    runId: string,
    _user: AuthenticatedUser,
    body: unknown,
  ): Promise<BrandRemixRunView> {
    const input = controlBrandRemixScenesSchema.parse(body);
    const { run, config } = await this.store.read(
      organizationId,
      runId,
      input.expectedRevision,
    );
    const pipeline = config.scenePipeline;
    assertSupportedSceneFidelity(config);
    if (config.review || config.reviewClaim)
      throw new ConflictException('Reviewed remix output is immutable.');
    if (!pipeline?.operation || !pipeline.quote)
      throw new ConflictException(
        'No accepted operation is available to resume.',
      );
    if (!canResumeScenePipeline(pipeline, run.updatedAt))
      throw new ConflictException(
        'The scene operation is still running. Cancel it or wait for it to stop.',
      );
    const operation = {
      ...pipeline.operation,
      resumedAt: new Date().toISOString(),
      cancellationGeneration: pipeline.cancellationGeneration,
      sequence: pipeline.operation.sequence + 1,
    };
    await this.store.save(organizationId, runId, config, {
      ...config,
      phase: 'generating',
      scenePipeline: {
        ...pipeline,
        operation,
        state:
          pipeline.quote.operation === 'analysis' ? 'analysing' : 'generating',
        error: undefined,
      },
    });
    await this.workflow.enqueue(organizationId, runId, operation);
    return this.store.view(organizationId, runId);
  }
}
