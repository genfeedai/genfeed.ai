import { BrandRemixRunPersistenceService } from '@api/collections/content-runs/services/brand-remix-run-persistence.service';
import { BrandRemixRunPlanningService } from '@api/collections/content-runs/services/brand-remix-run-planning.service';
import { projectBrandRemixRun } from '@api/collections/content-runs/services/brand-remix-run-projection';
import { BrandRemixRunStateService } from '@api/collections/content-runs/services/brand-remix-run-state.service';
import {
  type BrandRemixRunRecord,
  MAX_SERIALIZATION_RETRIES,
  PAID_DRAFT_CLAIM_LEASE_MS,
  type ResolvedBrandContext,
} from '@api/collections/content-runs/services/brand-remix-runs.types';
import {
  BRAND_REMIX_RUNTIME,
  type BrandRemixRuntime,
} from '@api/collections/content-runs/services/brand-remix-runtime';
import {
  type PausedMetaCampaignDraftResult,
  PausedMetaCampaignDraftService,
} from '@api/collections/content-runs/services/paused-meta-campaign-draft.service';
import {
  type PausedXAdsCampaignDraftResult,
  PausedXAdsCampaignDraftService,
} from '@api/collections/content-runs/services/paused-x-ads-campaign-draft.service';
import { ContentRunStatus } from '@genfeedai/contracts';
import {
  type BrandRemixExecution,
  type BrandRemixRunConfig,
  type BrandRemixRunView,
  brandRemixRunConfigSchema,
  type PreparePausedMetaCampaignDraft,
} from '@genfeedai/contracts/api-types/contracts/brand-remix-run.contract';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
} from '@nestjs/common';

type PaidDraftResult =
  | PausedMetaCampaignDraftResult
  | PausedXAdsCampaignDraftResult;

@Injectable()
export class BrandRemixRunPaidDraftService {
  constructor(
    private readonly planning: BrandRemixRunPlanningService,
    private readonly persistence: BrandRemixRunPersistenceService,
    private readonly state: BrandRemixRunStateService,
    private readonly pausedMetaCampaignDraftService: PausedMetaCampaignDraftService,
    private readonly pausedXAdsCampaignDraftService: PausedXAdsCampaignDraftService,
    @Inject(BRAND_REMIX_RUNTIME)
    private readonly runtime: BrandRemixRuntime,
  ) {}

  async prepare(
    organizationId: string,
    runId: string,
    userId: string,
    input: PreparePausedMetaCampaignDraft,
  ): Promise<BrandRemixRunView> {
    const prepared = await this.preparePaidDraftContext(
      organizationId,
      runId,
      input,
    );
    if (prepared.view) return prepared.view;
    if (!prepared.selectedVariant) {
      throw new ConflictException(
        `Select a ready approved remix variant for the ${prepared.targetPlatformLabel} draft.`,
      );
    }
    const claimed = await this.claimPaidDraftOperation({
      ...prepared,
      selectedVariant: prepared.selectedVariant,
    });
    if (claimed.view) return claimed.view;
    const paidDraft = await this.dispatchPaidDraft({
      brandId: prepared.brandId,
      claimedConfig: claimed.config,
      organizationId: prepared.organizationId,
      runId: prepared.runId,
      selectedVariant: prepared.selectedVariant,
      targetPlatform: prepared.targetPlatform,
      userId,
    });
    return this.persistPaidDraftResult({
      ...prepared,
      claimedConfig: claimed.config,
      paidDraft,
    });
  }

  private async preparePaidDraftContext(
    organizationId: string,
    runId: string,
    input: PreparePausedMetaCampaignDraft,
  ): Promise<{
    brandContext: ResolvedBrandContext;
    brandId: string;
    config: BrandRemixRunConfig;
    input: PreparePausedMetaCampaignDraft;
    organizationId: string;
    run: BrandRemixRunRecord;
    runId: string;
    selectedVariant?: BrandRemixExecution['variants'][number];
    targetPlatform: 'meta' | 'x';
    targetPlatformLabel: string;
    view?: BrandRemixRunView;
  }> {
    const initial = await this.persistence.requireRun(organizationId, runId);
    const reconciled = await this.state.reconcile(initial);
    const run = reconciled.run;
    let config = reconciled.config;
    const brandId = this.persistence.requireBrandId(run);
    const brandContext = await this.planning.resolveBrandContext(
      organizationId,
      brandId,
    );
    this.assertPaidDraftTarget(config, input);
    const targetPlatform = config.draft.target.platform as 'meta' | 'x';
    const targetPlatformLabel = targetPlatform === 'x' ? 'X Ads' : 'Meta';
    if (config.paidDraft) {
      if (
        config.paidDraft.credentialId !== input.destination.credentialId ||
        config.paidDraft.adAccountId !== input.destination.adAccountId ||
        (input.variantId !== undefined &&
          config.paidDraft.variantId !== input.variantId)
      ) {
        throw new ConflictException(
          `A paused ${targetPlatform === 'x' ? 'X Ads' : 'Meta'} draft already exists for another destination or variant.`,
        );
      }
      return {
        brandContext,
        brandId,
        config,
        input,
        organizationId,
        run,
        runId,
        targetPlatform,
        targetPlatformLabel,
        view: projectBrandRemixRun(run, brandContext, {
          ...config,
          paidDraft: { ...config.paidDraft, replayed: true },
        }),
      };
    }
    if (
      (config.phase !== 'approved' && config.phase !== 'paid_draft_creating') ||
      !config.review?.approvedPostIds.length
    ) {
      throw new ConflictException({
        detail:
          'Approve at least one Review draft before preparing a campaign.',
        title: 'Campaign review is incomplete',
      });
    }
    const capability = await this.applyAdsCapabilityReadiness({
      brandContext,
      brandId,
      config,
      input,
      organizationId,
      run,
      runId,
      targetPlatform,
    });
    if (capability.view) {
      return {
        brandContext,
        brandId,
        config: capability.config,
        input,
        organizationId,
        run: capability.run,
        runId,
        targetPlatform,
        targetPlatformLabel,
        view: capability.view,
      };
    }
    config = capability.config;
    const selectedVariant = this.requireReadyVariant(config, input.variantId);
    return {
      brandContext,
      brandId,
      config,
      input,
      organizationId,
      run,
      runId,
      selectedVariant,
      targetPlatform,
      targetPlatformLabel,
    };
  }

  private assertPaidDraftTarget(
    config: BrandRemixRunConfig,
    input: PreparePausedMetaCampaignDraft,
  ): void {
    if (
      config.draft.target.kind !== 'paid' ||
      (config.draft.target.platform !== 'meta' &&
        config.draft.target.platform !== 'x')
    ) {
      throw new BadRequestException({
        detail:
          'Paused campaign draft handoff currently requires a paid Meta or X target.',
        title: 'Unsupported campaign target',
      });
    }
    if (config.draft.target.platform === 'x' && !input.sourceTweetId) {
      throw new BadRequestException({
        detail:
          'An existing tweet id is required to prepare a paused X Ads draft.',
        title: 'Missing source tweet',
      });
    }
  }

  private async applyAdsCapabilityReadiness(params: {
    brandContext: ResolvedBrandContext;
    brandId: string;
    config: BrandRemixRunConfig;
    input: PreparePausedMetaCampaignDraft;
    organizationId: string;
    run: BrandRemixRunRecord;
    runId: string;
    targetPlatform: 'meta' | 'x';
  }): Promise<{
    config: BrandRemixRunConfig;
    run: BrandRemixRunRecord;
    view?: BrandRemixRunView;
  }> {
    const credential = await this.planning.assertConnectedCredential(
      params.organizationId,
      params.brandId,
      params.input.destination.credentialId,
      params.targetPlatform,
    );
    const requiredScope =
      params.targetPlatform === 'x' ? 'ads.write' : 'ads_management';
    const hasAdsCapability = Boolean(
      credential.grantedScopesCapturedAt &&
        credential.grantedScopes.includes(requiredScope),
    );
    const capabilityIssue = {
      code:
        params.targetPlatform === 'x'
          ? ('missing_ads_write' as const)
          : ('missing_ads_management' as const),
      field: 'target' as const,
      message:
        params.targetPlatform === 'x'
          ? 'Reconnect X Ads and grant ads.write before preparing a paused campaign draft.'
          : 'Reconnect Meta and grant ads_management before preparing a paused campaign draft.',
      severity: 'blocked' as const,
    };
    if (!hasAdsCapability) {
      const blockedConfig = brandRemixRunConfigSchema.parse({
        ...params.config,
        readiness: {
          issues: [
            ...params.config.readiness.issues.filter(
              (issue) => issue.code !== capabilityIssue.code,
            ),
            capabilityIssue,
          ],
          state: 'blocked',
        },
      });
      const updated = await this.persistence.compareAndSwapExactConfig({
        expectedConfig: params.config,
        nextConfig: blockedConfig,
        organizationId: params.organizationId,
        runId: params.runId,
        status: params.run.status as ContentRunStatus,
      });
      if (!updated) {
        throw new ConflictException(
          `The ${params.targetPlatform === 'x' ? 'X Ads' : 'Meta'} capability readiness changed concurrently.`,
        );
      }
      return {
        config: blockedConfig,
        run: updated,
        view: projectBrandRemixRun(updated, params.brandContext, blockedConfig),
      };
    }
    if (
      !params.config.readiness.issues.some(
        (issue) => issue.code === capabilityIssue.code,
      )
    ) {
      return { config: params.config, run: params.run };
    }
    const issues = params.config.readiness.issues.filter(
      (issue) => issue.code !== capabilityIssue.code,
    );
    const readyConfig = brandRemixRunConfigSchema.parse({
      ...params.config,
      readiness: {
        issues,
        state: issues.some((issue) => issue.severity === 'blocked')
          ? 'blocked'
          : issues.length
            ? 'degraded'
            : 'ready',
      },
    });
    const updated = await this.persistence.compareAndSwapExactConfig({
      expectedConfig: params.config,
      nextConfig: readyConfig,
      organizationId: params.organizationId,
      runId: params.runId,
      status: params.run.status as ContentRunStatus,
    });
    if (!updated) {
      throw new ConflictException(
        `The ${params.targetPlatform === 'x' ? 'X Ads' : 'Meta'} capability readiness changed concurrently.`,
      );
    }
    return { config: readyConfig, run: updated };
  }

  private requireReadyVariant(
    config: BrandRemixRunConfig,
    variantId: string | undefined,
  ): BrandRemixExecution['variants'][number] {
    const requestedVariant = config.execution?.variants.find(
      (variant) => variant.id === variantId,
    );
    if (variantId !== undefined && !requestedVariant) {
      throw new ConflictException(
        'The requested remix variant does not exist on this run.',
      );
    }
    const selectedVariant =
      requestedVariant ??
      config.execution?.variants.find((variant) => variant.status === 'ready');
    if (selectedVariant?.status !== 'ready') {
      const targetPlatform = config.draft.target.platform;
      throw new ConflictException(
        `Select a ready approved remix variant for the ${targetPlatform === 'x' ? 'X Ads' : 'Meta'} draft.`,
      );
    }
    return selectedVariant;
  }

  private async claimPaidDraftOperation(params: {
    brandContext: ResolvedBrandContext;
    config: BrandRemixRunConfig;
    input: PreparePausedMetaCampaignDraft;
    organizationId: string;
    run: BrandRemixRunRecord;
    runId: string;
    selectedVariant: BrandRemixExecution['variants'][number];
    targetPlatform: 'meta' | 'x';
    targetPlatformLabel: string;
  }): Promise<{
    config: BrandRemixRunConfig;
    view?: BrandRemixRunView;
  }> {
    const operation = {
      adAccountId: params.input.destination.adAccountId,
      claimedAt: this.runtime.now().toISOString(),
      credentialId: params.input.destination.credentialId,
      id: `${params.run.id}:${params.targetPlatform}:${params.config.revision}:${params.selectedVariant.id}`,
      linkUrl:
        params.targetPlatform === 'meta'
          ? (params.config.sourceSnapshot.destinationUrl ??
            params.config.sourceSnapshot.canonicalUrl)
          : undefined,
      sourceTweetId:
        params.targetPlatform === 'x' ? params.input.sourceTweetId : undefined,
      variantId: params.selectedVariant.id,
    };
    if (params.targetPlatform === 'meta' && !operation.linkUrl) {
      throw new ConflictException(
        'The authorized source has no HTTPS campaign destination.',
      );
    }
    if (params.targetPlatform === 'x' && !operation.sourceTweetId) {
      throw new ConflictException(
        'An existing tweet id is required to prepare a paused X Ads draft.',
      );
    }
    if (!params.config.paidDraftOperation) {
      const claimedConfig = brandRemixRunConfigSchema.parse({
        ...params.config,
        paidDraftOperation: operation,
        phase: 'paid_draft_creating',
      });
      const claimed = await this.persistence.compareAndSwapExactConfig({
        expectedConfig: params.config,
        nextConfig: claimedConfig,
        organizationId: params.organizationId,
        runId: params.runId,
        status: ContentRunStatus.RUNNING,
      });
      if (!claimed) {
        throw new ConflictException(
          `A concurrent ${params.targetPlatformLabel} draft action won the claim.`,
        );
      }
      return { config: claimedConfig };
    }
    const matchesClaim =
      params.config.paidDraftOperation.credentialId ===
        params.input.destination.credentialId &&
      params.config.paidDraftOperation.adAccountId ===
        params.input.destination.adAccountId &&
      params.config.paidDraftOperation.variantId === params.selectedVariant.id;
    const claimAge =
      this.runtime.now().getTime() -
      new Date(params.config.paidDraftOperation.claimedAt).getTime();
    if (claimAge < PAID_DRAFT_CLAIM_LEASE_MS) {
      if (matchesClaim) {
        return {
          config: params.config,
          view: projectBrandRemixRun(
            params.run,
            params.brandContext,
            params.config,
          ),
        };
      }
      throw new ConflictException(
        `Resume the existing ${params.targetPlatformLabel} draft destination and variant until its recovery lease expires.`,
      );
    }
    const claimedConfig = brandRemixRunConfigSchema.parse({
      ...params.config,
      paidDraftOperation: operation,
      phase: 'paid_draft_creating',
    });
    const reclaimed = await this.persistence.compareAndSwapExactConfig({
      expectedConfig: params.config,
      nextConfig: claimedConfig,
      organizationId: params.organizationId,
      runId: params.runId,
      status: ContentRunStatus.RUNNING,
    });
    if (!reclaimed) {
      throw new ConflictException(
        `A concurrent ${params.targetPlatformLabel} draft recovery won the claim.`,
      );
    }
    return { config: claimedConfig };
  }

  private async dispatchPaidDraft(params: {
    brandId: string;
    claimedConfig: BrandRemixRunConfig;
    organizationId: string;
    runId: string;
    selectedVariant: BrandRemixExecution['variants'][number];
    targetPlatform: 'meta' | 'x';
    userId: string;
  }): Promise<PaidDraftResult> {
    try {
      return params.targetPlatform === 'x'
        ? await this.pausedXAdsCampaignDraftService.prepare({
            adAccountId: params.claimedConfig.paidDraftOperation
              ?.adAccountId as string,
            brandId: params.brandId,
            config: params.claimedConfig,
            credentialId: params.claimedConfig.paidDraftOperation
              ?.credentialId as string,
            organizationId: params.organizationId,
            runId: params.runId,
            sourceTweetId: params.claimedConfig.paidDraftOperation
              ?.sourceTweetId as string,
            userId: params.userId,
            variant: params.selectedVariant,
          })
        : await this.pausedMetaCampaignDraftService.prepare({
            adAccountId: params.claimedConfig.paidDraftOperation
              ?.adAccountId as string,
            brandId: params.brandId,
            config: params.claimedConfig,
            credentialId: params.claimedConfig.paidDraftOperation
              ?.credentialId as string,
            linkUrl: params.claimedConfig.paidDraftOperation?.linkUrl as string,
            organizationId: params.organizationId,
            runId: params.runId,
            userId: params.userId,
            variant: params.selectedVariant,
          });
    } catch (error: unknown) {
      await this.releasePaidDraftOperationAfterFailure({
        claimedConfig: params.claimedConfig,
        organizationId: params.organizationId,
        runId: params.runId,
      });
      throw error;
    }
  }

  private async persistPaidDraftResult(params: {
    brandContext: ResolvedBrandContext;
    claimedConfig: BrandRemixRunConfig;
    organizationId: string;
    paidDraft: PaidDraftResult;
    runId: string;
    targetPlatform: 'meta' | 'x';
  }): Promise<BrandRemixRunView> {
    const nextConfig = brandRemixRunConfigSchema.parse({
      ...params.claimedConfig,
      paidDraft: params.paidDraft,
      paidDraftOperation: undefined,
      phase: 'paid_draft_ready',
    });
    const updated = await this.persistence.compareAndSwapExactConfig({
      expectedConfig: params.claimedConfig,
      nextConfig,
      organizationId: params.organizationId,
      runId: params.runId,
      status: ContentRunStatus.COMPLETED,
    });
    if (updated) {
      return projectBrandRemixRun(updated, params.brandContext, nextConfig);
    }
    const recovered = await this.recoverPaidDraftResult(params);
    if (recovered) return recovered;
    throw new ConflictException(
      `The ${params.targetPlatform === 'x' ? 'X Ads' : 'Meta'} draft result changed concurrently.`,
    );
  }

  private async recoverPaidDraftResult(params: {
    brandContext: ResolvedBrandContext;
    claimedConfig: BrandRemixRunConfig;
    organizationId: string;
    paidDraft: PaidDraftResult;
    runId: string;
  }): Promise<BrandRemixRunView | null> {
    for (let attempt = 0; attempt < MAX_SERIALIZATION_RETRIES; attempt += 1) {
      const latest = await this.persistence.requireRun(
        params.organizationId,
        params.runId,
      );
      const latestConfig = this.persistence.parseConfig(
        latest.config,
        params.runId,
      );
      if (latestConfig.paidDraft) {
        if (
          latestConfig.paidDraft.credentialId ===
            params.paidDraft.credentialId &&
          latestConfig.paidDraft.adAccountId === params.paidDraft.adAccountId &&
          latestConfig.paidDraft.variantId === params.paidDraft.variantId
        ) {
          return projectBrandRemixRun(
            latest,
            params.brandContext,
            latestConfig,
          );
        }
        return null;
      }
      const latestOperation = latestConfig.paidDraftOperation;
      if (
        !latestOperation ||
        latestOperation.id !== params.claimedConfig.paidDraftOperation?.id ||
        latestOperation.claimedAt !==
          params.claimedConfig.paidDraftOperation?.claimedAt ||
        latestOperation.credentialId !== params.paidDraft.credentialId ||
        latestOperation.adAccountId !== params.paidDraft.adAccountId ||
        latestOperation.variantId !== params.paidDraft.variantId
      ) {
        return null;
      }
      const recoveredConfig = brandRemixRunConfigSchema.parse({
        ...latestConfig,
        paidDraft: params.paidDraft,
        paidDraftOperation: undefined,
        phase: 'paid_draft_ready',
      });
      const recovered = await this.persistence.compareAndSwapExactConfig({
        expectedConfig: latestConfig,
        nextConfig: recoveredConfig,
        organizationId: params.organizationId,
        runId: params.runId,
        status: ContentRunStatus.COMPLETED,
      });
      if (recovered) {
        return projectBrandRemixRun(
          recovered,
          params.brandContext,
          recoveredConfig,
        );
      }
    }
    return null;
  }

  private async releasePaidDraftOperationAfterFailure(params: {
    claimedConfig: BrandRemixRunConfig;
    organizationId: string;
    runId: string;
  }): Promise<void> {
    const claimedOperation = params.claimedConfig.paidDraftOperation;
    if (!claimedOperation) return;
    let expectedConfig = params.claimedConfig;
    for (let attempt = 0; attempt < MAX_SERIALIZATION_RETRIES; attempt += 1) {
      if (
        expectedConfig.paidDraftOperation?.id !== claimedOperation.id ||
        expectedConfig.paidDraftOperation.claimedAt !==
          claimedOperation.claimedAt
      ) {
        return;
      }
      const releasedConfig = brandRemixRunConfigSchema.parse({
        ...expectedConfig,
        paidDraftOperation: undefined,
        phase: 'approved',
      });
      const released = await this.persistence.compareAndSwapExactConfig({
        expectedConfig,
        nextConfig: releasedConfig,
        organizationId: params.organizationId,
        runId: params.runId,
        status: ContentRunStatus.COMPLETED,
      });
      if (released) return;
      const latest = await this.persistence.requireRun(
        params.organizationId,
        params.runId,
      );
      expectedConfig = this.persistence.parseConfig(latest.config, latest.id);
    }
  }
}
