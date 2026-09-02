import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
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
import type { RequestWithContext as Request } from '@api/common/middleware/request-context.middleware';
import { ContentRunStatus } from '@genfeedai/contracts';
import {
  BRAND_REMIX_RUN_CONTRACT,
  BRAND_REMIX_RUN_VERSION,
  type BrandRemixRunView,
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
  ) {}

  async create(
    organizationId: string,
    brandId: string,
    body: unknown,
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
    const reusable = input.edits
      ? null
      : await this.persistence.findReusablePrefilledRun(
          organizationId,
          brandId,
          input.source,
        );
    if (reusable) {
      return projectBrandRemixRun(
        reusable,
        brandContext,
        this.persistence.parseConfig(reusable.config, reusable.id),
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
    const readiness = this.planning.buildReadiness(brandContext, draft);
    const config = brandRemixRunConfigSchema.parse({
      contract: BRAND_REMIX_RUN_CONTRACT,
      draft,
      phase: 'prefilled',
      readiness,
      recipeVersion: BRAND_REMIX_RUN_VERSION,
      revision: 1,
      sourceSnapshot: resolvedSource.snapshot,
      version: BRAND_REMIX_RUN_VERSION,
    });
    const persisted = await this.persistence.createOrReusePrefilledRun({
      brandId,
      config,
      organizationId,
      selector: input.source,
    });

    return projectBrandRemixRun(
      persisted,
      brandContext,
      this.persistence.parseConfig(persisted.config, persisted.id),
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
    if (config.phase !== 'prefilled' && config.phase !== 'failed') {
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
    const draft = await this.planning.resolveDraft(
      organizationId,
      brandId,
      brandContext,
      config.draft,
      input.edits,
    );
    const nextConfig = brandRemixRunConfigSchema.parse({
      ...config,
      draft,
      execution: undefined,
      generationClaim: undefined,
      paidDraft: undefined,
      paidDraftOperation: undefined,
      phase: 'prefilled',
      readiness: this.planning.buildReadiness(brandContext, draft),
      review: undefined,
      reviewClaim: undefined,
      revision: config.revision + 1,
    });
    const updated = await this.persistence.compareAndSwapConfig({
      expectedPhase: config.phase,
      expectedRevision: input.expectedRevision,
      nextConfig,
      organizationId,
      runId,
      status: ContentRunStatus.PENDING,
    });

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
}
