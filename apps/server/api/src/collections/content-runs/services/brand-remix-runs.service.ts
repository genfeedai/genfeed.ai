import { hasUnreconciledSceneWork, invalidateScenePipeline, isSceneOperationActive } from '@api/collections/content-runs/services/brand-remix-scene-state';
import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import {
  mergeBrandRemixConcept,
  seedBrandRemixConcept,
} from '@api/collections/content-runs/services/brand-remix-concept';
import { BrandRemixRunExecutionService } from '@api/collections/content-runs/services/brand-remix-run-execution.service';
import {
  parseBrandRemixPayload,
  staleRemixRevision,
} from '@api/collections/content-runs/services/brand-remix-run-helpers';
import { BrandRemixRunPaidDraftService } from '@api/collections/content-runs/services/brand-remix-run-paid-draft.service';
import { BrandRemixRunPersistenceService } from '@api/collections/content-runs/services/brand-remix-run-persistence.service';
import { BrandRemixRunPlanningService } from '@api/collections/content-runs/services/brand-remix-run-planning.service';
import { projectBrandRemixRun } from '@api/collections/content-runs/services/brand-remix-run-projection';
import { BrandRemixRunReviewService } from '@api/collections/content-runs/services/brand-remix-run-review.service';
import { BrandRemixRunStateService } from '@api/collections/content-runs/services/brand-remix-run-state.service';
import type {
  BrandRemixRunRecord,
  ResolvedBrandContext,
} from '@api/collections/content-runs/services/brand-remix-runs.types';
import {
  BrandRemixSourceMediaService,
  type RemixSourceMediaIngestResult,
} from '@api/collections/content-runs/services/brand-remix-source-media.service';
import type { RequestWithContext as Request } from '@api/common/middleware/request-context.middleware';
import { ContentRunStatus, IngredientCategory } from '@genfeedai/contracts';
import {
  BRAND_REMIX_RUN_CONTRACT,
  BRAND_REMIX_RUN_VERSION,
  type BrandRemixRunView,
  type BrandRemixSourceSnapshot,
  brandRemixRunConfigSchema,
  createBrandRemixRunSchema,
  preparePausedMetaCampaignDraftSchema,
  reviseBrandRemixRunSchema,
  startBrandRemixRunSchema,
  submitBrandRemixRunForReviewSchema,
} from '@genfeedai/contracts/api-types/contracts/brand-remix-run.contract';
import { ConflictException, Injectable } from '@nestjs/common';

/**
 * Public brand-remix façade. Planning, persistence, state transitions,
 * provider dispatch, execution, review, and paid-draft handoff stay in
 * independently testable services.
 */
@Injectable()
export class BrandRemixRunsService {
  constructor(
    private readonly planning: BrandRemixRunPlanningService,
    private readonly persistence: BrandRemixRunPersistenceService,
    private readonly state: BrandRemixRunStateService,
    private readonly execution: BrandRemixRunExecutionService,
    private readonly review: BrandRemixRunReviewService,
    private readonly paidDraft: BrandRemixRunPaidDraftService,
    private readonly sourceMedia: BrandRemixSourceMediaService,
  ) {}

  async create(
    organizationId: string,
    brandId: string,
    body: unknown,
    userId?: string,
  ): Promise<BrandRemixRunView> {
    const input = parseBrandRemixPayload(
      createBrandRemixRunSchema,
      body,
      'create',
    );
    const brandContext = await this.planning.resolveBrandContext(
      organizationId,
      brandId,
    );
    if (input.source.kind === 'connected_ad') {
      await this.planning.assertConnectedCredential(
        organizationId,
        brandId,
        input.source.credentialId,
        input.source.platform,
      );
    }
    const resolvedSource = await this.planning.resolveSource(
      organizationId,
      brandId,
      input.source,
    );
    const ingestedSourceMedia = userId
      ? await this.sourceMedia.ingest({
          brandId,
          organizationId,
          source: resolvedSource,
          userId,
        })
      : { status: 'skipped' as const };
    const reusable = input.edits
      ? null
      : await this.persistence.findReusablePrefilledRun(
          organizationId,
          brandId,
          input.source,
        );
    const media = this.sourceMediaSnapshot(ingestedSourceMedia);
    if (reusable) {
      return this.refreshPrefilledSourceMedia(
        organizationId,
        brandId,
        brandContext,
        reusable,
        userId ? media : undefined,
      );
    }
    const defaults = this.planning.defaultDraft(brandContext, resolvedSource);
    const draft = await this.planning.resolveDraft(
      organizationId,
      brandId,
      brandContext,
      defaults,
      input.edits,
    );
    const readiness = this.planning.buildReadiness(
      brandContext,
      draft,
      ingestedSourceMedia,
    );
    const config = brandRemixRunConfigSchema.parse({
      concept: seedBrandRemixConcept({
        objective: draft.intent.objective,
        pattern: resolvedSource.snapshot.pattern,
        savedAt: new Date().toISOString(),
      }),
      contract: BRAND_REMIX_RUN_CONTRACT,
      draft,
      phase: 'prefilled',
      readiness,
      recipeVersion: BRAND_REMIX_RUN_VERSION,
      revision: 1,
      sourceSnapshot: {
        ...resolvedSource.snapshot,
        media,
      },
      version: BRAND_REMIX_RUN_VERSION,
    });
    const persisted = await this.persistence.createOrReusePrefilledRun({
      brandId,
      config,
      isReusable: !input.edits,
      organizationId,
      selector: input.source,
    });

    return this.refreshPrefilledSourceMedia(
      organizationId,
      brandId,
      brandContext,
      persisted,
      userId ? media : undefined,
    );
  }

  async get(organizationId: string, runId: string): Promise<BrandRemixRunView> {
    const run = await this.persistence.requireRun(organizationId, runId);
    const brandContext = await this.planning.resolveBrandContext(
      organizationId,
      this.persistence.requireBrandId(run),
    );
    const reconciled = await this.state.reconcile(run);
    return projectBrandRemixRun(
      reconciled.run,
      brandContext,
      reconciled.config,
    );
  }

  async revise(
    organizationId: string,
    runId: string,
    body: unknown,
  ): Promise<BrandRemixRunView> {
    const input = parseBrandRemixPayload(
      reviseBrandRemixRunSchema,
      body,
      'revise',
    );
    const run = await this.persistence.requireRun(organizationId, runId);
    const config = this.persistence.parseConfig(run.config, runId);
    if (config.revision !== input.expectedRevision) {
      throw staleRemixRevision(input.expectedRevision, config.revision);
    }
    if (hasUnreconciledSceneWork(config.scenePipeline)) throw new ConflictException('Reconcile accepted or uncertain scene work before editing.');
    if (isSceneOperationActive(config.scenePipeline)) throw new ConflictException('Cancel the active scene operation before editing.');
    if (config.phase !== 'prefilled' && config.phase !== 'failed' && !(config.scenePipeline && config.phase === 'ready_for_review' && !config.review)) {
      throw new ConflictException({
        detail:
          'A generated remix is immutable. Create another remix from the same source to vary it.',
        title: 'Remix recipe is already executing',
      });
    }

    const brandId = this.persistence.requireBrandId(run);
    const brandContext = await this.planning.resolveBrandContext(
      organizationId,
      brandId,
    );
    const sanitized = await this.planning.sanitizePersistedDraft(
      organizationId,
      brandId,
      config.draft,
    );
    const removedIds = new Set(
      config.draft.references
        .filter(
          (reference) =>
            !sanitized.references.some(
              (retained) => retained.assetId === reference.assetId,
            ),
        )
        .map((reference) => reference.assetId),
    );
    const edits = input.edits.references
      ? {
          ...input.edits,
          references: input.edits.references.filter(
            (reference) => !removedIds.has(reference.assetId),
          ),
        }
      : input.edits;
    const draft = await this.planning.resolveDraft(
      organizationId,
      brandId,
      brandContext,
      sanitized,
      edits,
    );
    const concept = input.edits.concept
      ? mergeBrandRemixConcept(
          config.concept,
          input.edits.concept,
          new Date().toISOString(),
        )
      : config.concept;
    const nextConfig = brandRemixRunConfigSchema.parse({
      ...config,
      ...(concept ? { concept } : {}),
      draft,
      scenePipeline: invalidateScenePipeline(config, { ...config, draft, concept }),
      generationQuote: undefined,
      execution: undefined,
      generationClaim: undefined,
      paidDraft: undefined,
      paidDraftOperation: undefined,
      phase: 'prefilled',
      readiness: this.planning.buildReadiness(
        brandContext,
        draft,
        config.sourceSnapshot.media,
      ),
      review: undefined,
      reviewClaim: undefined,
      revision: config.revision + 1,
    });
    const updated = await this.persistence.compareAndSwapExactConfig({
      expectedConfig: config,
      nextConfig,
      organizationId,
      runId,
      status: ContentRunStatus.PENDING,
    });

    if (!updated)
      throw staleRemixRevision(input.expectedRevision, config.revision);
    return projectBrandRemixRun(updated, brandContext, nextConfig);
  }

  async start(
    organizationId: string,
    runId: string,
    user: User,
    request: Request,
    body: unknown,
  ): Promise<BrandRemixRunView> {
    const input = parseBrandRemixPayload(
      startBrandRemixRunSchema,
      body,
      'start',
    );
    const run = await this.persistence.requireRun(organizationId, runId);
    const config = this.persistence.parseConfig(run.config, runId);
    if (config.scenePipeline || (['video', 'avatar'].includes(config.draft.output.kind) && (config.concept?.storyboard.length ?? 0) > 1)) throw new ConflictException('Use the scene quote and explicit acceptance flow to generate this complete ad.');
    return this.execution.start(organizationId, runId, user, request, input);
  }

  async submitForReview(
    organizationId: string,
    runId: string,
    userId: string,
    body: unknown,
  ): Promise<BrandRemixRunView> {
    const input = parseBrandRemixPayload(
      submitBrandRemixRunForReviewSchema,
      body,
      'review',
    );
    return this.review.submit(organizationId, runId, userId, input);
  }

  async preparePausedMetaDraft(
    organizationId: string,
    runId: string,
    userId: string,
    body: unknown,
  ): Promise<BrandRemixRunView> {
    const input = parseBrandRemixPayload(
      preparePausedMetaCampaignDraftSchema,
      body,
      'paid draft',
    );
    return this.paidDraft.prepare(organizationId, runId, userId, input);
  }

  private sourceMediaSnapshot(
    media: RemixSourceMediaIngestResult,
  ): NonNullable<BrandRemixSourceSnapshot['media']> {
    if (media.status === 'saved') {
      return {
        status: 'saved',
        assetId: media.assetId,
        category:
          media.category === IngredientCategory.IMAGE ? 'image' : 'video',
        purpose: 'analysis_only',
      };
    }
    if (media.status === 'unavailable') {
      return {
        status: 'unavailable',
        reason: media.reason,
        purpose: 'analysis_only',
      };
    }
    return { status: 'skipped', purpose: 'analysis_only' };
  }

  private async refreshPrefilledSourceMedia(
    organizationId: string,
    brandId: string,
    brandContext: ResolvedBrandContext,
    run: BrandRemixRunRecord,
    media: BrandRemixSourceSnapshot['media'],
  ): Promise<BrandRemixRunView> {
    const config = this.persistence.parseConfig(run.config, run.id);
    const nextMedia = media ?? config.sourceSnapshot.media;
    const prepared = await this.planning.preparePersistedDraft(
      organizationId,
      brandId,
      brandContext,
      config.draft,
      nextMedia,
    );
    const concept =
      config.concept ??
      seedBrandRemixConcept({
        objective: prepared.draft.intent.objective,
        pattern: config.sourceSnapshot.pattern,
        savedAt: new Date().toISOString(),
      });
    if (
      config.concept &&
      JSON.stringify(config.sourceSnapshot.media) ===
        JSON.stringify(nextMedia) &&
      JSON.stringify(config.draft) === JSON.stringify(prepared.draft) &&
      JSON.stringify(config.readiness) === JSON.stringify(prepared.readiness)
    ) {
      return projectBrandRemixRun(run, brandContext, config);
    }
    if (config.phase !== 'prefilled') {
      throw new ConflictException(
        'The remix changed while preparing its source. Reload it and retry.',
      );
    }
    const nextConfig = brandRemixRunConfigSchema.parse({
      ...config,
      concept,
      draft: prepared.draft,
      sourceSnapshot: { ...config.sourceSnapshot, media: nextMedia },
      readiness: prepared.readiness,
      revision: config.revision + 1,
    });
    const updated = await this.persistence.compareAndSwapExactConfig({
      expectedConfig: config,
      nextConfig,
      organizationId,
      runId: run.id,
      status: ContentRunStatus.PENDING,
    });
    if (!updated) {
      throw new ConflictException(
        'The remix changed while preparing its source. Reload it and retry.',
      );
    }
    return projectBrandRemixRun(updated, brandContext, nextConfig);
  }
}
