import { resolveGenerationBrand } from '@api/collections/brands/utils/resolve-generation-brand.util';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { TurboRunService } from '@api/services/turbo-run/turbo-run.service';
import { TurboRunCreditsService } from '@api/services/turbo-run/turbo-run-credits.service';
import { TurboRunWorkflowService } from '@api/services/turbo-run/turbo-run-workflow.service';
import { formatPlatformLabel } from '@genfeedai/contracts';
import {
  contentMixFromToolArguments,
  estimateTurboRunCredits,
} from '@genfeedai/contracts/constants';
import type { AgentToolResult } from '@genfeedai/contracts/interfaces';
import { SystemWorkflowDispatchClass } from '@genfeedai/contracts/queue';
import { LoggerService } from '@libs/logger/logger.service';
import { Inject, Injectable, Optional } from '@nestjs/common';

interface AgentBrandsServiceLike {
  findOne: (
    params: Record<string, unknown>,
    context?: string,
  ) => Promise<Record<string, unknown> | null>;
}

interface AgentMembersServiceLike {
  findOne: (
    params: Record<string, unknown>,
  ) => Promise<{ currentBrandId?: unknown } | null>;
}

// DTO *Percent keys differ from estimator ContentFormat keys; this explicit
// shape prevents media-heavy requests from silently using the default mix.
interface ContentMixPercents {
  imagePercent: number;
  videoPercent: number;
  carouselPercent: number;
  reelPercent: number;
  storyPercent: number;
}

type TurboRunRecord = Awaited<ReturnType<TurboRunService['createTurboRun']>>;

type BatchExecution = {
  turboRun: TurboRunRecord;
  turboRunId: string;
  estimatedCredits: number;
  platformLabel: string;
  platforms: string[];
  pricingOptions: { includeMedia: boolean; qualityTier?: string | null };
};

const TURBO_RUN_RESERVATION_TTL_MS = 8 * 24 * 60 * 60 * 1000;

function parseContentMixPercents(
  input: unknown,
): ContentMixPercents | undefined {
  if (!input || typeof input !== 'object') {
    return undefined;
  }
  const raw = input as Record<string, unknown>;
  const readPercent = (key: keyof ContentMixPercents): number => {
    const value = raw[key];
    return typeof value === 'number' && Number.isFinite(value) && value >= 0
      ? value
      : 0;
  };
  const percents: ContentMixPercents = {
    carouselPercent: readPercent('carouselPercent'),
    imagePercent: readPercent('imagePercent'),
    reelPercent: readPercent('reelPercent'),
    storyPercent: readPercent('storyPercent'),
    videoPercent: readPercent('videoPercent'),
  };
  return Object.values(percents).some((percent) => percent > 0)
    ? percents
    : undefined;
}

@Injectable()
export class AgentMediaTurboRunService {
  // Preserve the legacy log category so operational searches and alerts keep
  // matching after ownership moved out of the public facade.
  private readonly logContext = 'AgentMediaGenerationToolHandler';

  constructor(
    private readonly loggerService: LoggerService,
    @Inject('AGENT_BRANDS_SERVICE')
    private readonly brandsService: AgentBrandsServiceLike,
    @Inject('AGENT_MEMBERS_SERVICE')
    private readonly membersService: AgentMembersServiceLike,
    private readonly turboRunWorkflowService: TurboRunWorkflowService,
    @Optional()
    private readonly turboRunService?: TurboRunService,
    @Optional()
    private readonly credentialsService?: CredentialsService,
    @Optional()
    private readonly creditsUtilsService?: CreditsUtilsService,
    @Optional()
    private readonly turboRunCreditsService?: TurboRunCreditsService,
  ) {}

  async generateTurboContent(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    if (!this.turboRunService) {
      return {
        creditsUsed: 0,
        error: 'Turbo run service not available',
        success: false,
      };
    }

    const brandId = await this.resolveBrandId(params, ctx);
    if ('error' in brandId) return brandId.error;

    const prepared = this.prepareTurboRun(params, ctx);
    if (
      ctx.creditBudget !== undefined &&
      (!Number.isFinite(ctx.creditBudget) ||
        ctx.creditBudget < prepared.estimatedCredits)
    ) {
      return {
        creditsUsed: 0,
        error: `Agent credit budget cannot cover this batch (${prepared.estimatedCredits} credits required).`,
        success: false,
      };
    }
    const execution = await this.createAndReserveTurboRun(
      params,
      ctx,
      brandId.value,
      prepared,
    );
    if ('error' in execution) return execution.error;

    return this.queueOrRunTurboRun(execution.value, ctx);
  }

  private async resolveBrandId(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<{ value: string } | { error: AgentToolResult }> {
    let brandId =
      (params.brandId as string | undefined) ?? ctx.brandId ?? undefined;
    const handle = params.handle as string | undefined;

    if (handle && !brandId && this.credentialsService) {
      const credential =
        typeof this.credentialsService.findByHandle === 'function'
          ? await this.credentialsService.findByHandle(
              handle,
              ctx.organizationId,
            )
          : null;
      if (!credential) {
        return {
          error: {
            creditsUsed: 0,
            error: `No connected credential found for handle "${handle}"`,
            success: false,
          },
        };
      }
      brandId = credential.brandId ?? undefined;
    }

    if (!brandId) {
      const currentBrand = await resolveGenerationBrand({
        brandsService: this.brandsService,
        contextBrandId: ctx.brandId,
        membersService: this.membersService,
        organizationId: ctx.organizationId,
        userId: ctx.userId,
      });
      if (currentBrand?.id) brandId = String(currentBrand.id);
    }

    return brandId
      ? { value: brandId }
      : {
          error: {
            creditsUsed: 0,
            error: 'brandId or handle is required',
            success: false,
          },
        };
  }

  private prepareTurboRun(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): {
    contentMix?: ContentMixPercents;
    count: number;
    dateRange: Record<string, string>;
    estimatedCredits: number;
    platforms: string[];
    pricingOptions: BatchExecution['pricingOptions'];
  } {
    const count = (params.count as number) || 10;
    const platforms = (params.platforms as string[]) || ['instagram'];
    const pricingOptions = {
      // Caption-first pricing: drafts do not own generated media yet.
      includeMedia: false,
      qualityTier: ctx.qualityTier,
    };
    const contentMix = parseContentMixPercents(params.contentMix);
    const estimatedCredits = estimateTurboRunCredits(
      {
        contentMix: contentMixFromToolArguments(params.contentMix),
        count,
        platforms,
      },
      pricingOptions,
    );
    const dateRange = (params.dateRange as Record<string, string>) || {
      end: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      start: new Date().toISOString(),
    };
    return {
      contentMix,
      count,
      dateRange,
      estimatedCredits,
      platforms,
      pricingOptions,
    };
  }

  private async createAndReserveTurboRun(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
    brandId: string,
    prepared: ReturnType<AgentMediaTurboRunService['prepareTurboRun']>,
  ): Promise<{ value: BatchExecution } | { error: AgentToolResult }> {
    if (!this.turboRunService) {
      return {
        error: {
          creditsUsed: 0,
          error: 'Turbo run service not available',
          success: false,
        },
      };
    }
    let turboRun: TurboRunRecord;
    // createTurboRun persists items before credits move; if reserve fails, the
    // compensation below must cancel them or #2696 leaves an orphan run.
    // createTurboRun validates platforms before generation or credit movement.
    try {
      turboRun = await this.turboRunService.createTurboRun(
        {
          brandId,
          contentMix: prepared.contentMix,
          count: prepared.count,
          dateRange: {
            end: prepared.dateRange.end,
            start: prepared.dateRange.start,
          },
          platforms: prepared.platforms,
          style: params.style as string | undefined,
          topics: params.topics as string[] | undefined,
        },
        ctx.userId,
        ctx.organizationId,
        ...(ctx.strategyId ? ([undefined, ctx.strategyId] as const) : []),
      );
    } catch (error) {
      return {
        error: {
          creditsUsed: 0,
          error:
            error instanceof Error ? error.message : 'Failed to create run',
          success: false,
        },
      };
    }

    const turboRunId = String(turboRun.id);
    // Atomic reserve plus the run reference claim prevents concurrent spend.
    const reservation = await this.reserveCreditsOrCancel({
      amount: prepared.estimatedCredits,
      turboRunId,
      brandId,
      ctx,
    });
    if ('error' in reservation) return reservation;

    // Pin pricing before work so settlement moves only the eventual delta.
    // Only a held reservation needs pinning: deployments without managed credits
    // take no hold, so there is nothing to record and nothing to compensate.
    let recorded = true;
    if (reservation.reservationId) {
      try {
        recorded =
          (await this.turboRunCreditsService?.recordUpfrontCharge({
            turboRunId,
            credits: prepared.estimatedCredits,
            organizationId: ctx.organizationId,
            pricingOptions: prepared.pricingOptions,
            reservationId: reservation.reservationId,
          })) === true;
      } catch (recordError) {
        this.loggerService.warn(
          `${this.logContext} failed to record a batch reservation`,
          { turboRunId, organizationId: ctx.organizationId, recordError },
        );
        recorded = false;
      }
    }
    if (!recorded) {
      await this.compensateUnrecordedReservation({
        turboRunId,
        organizationId: ctx.organizationId,
        reservationId: reservation.reservationId,
      });
      return {
        error: {
          creditsUsed: 0,
          error: 'Turbo run credit reservation could not be recorded',
          success: false,
        },
      };
    }

    return {
      value: {
        turboRun,
        turboRunId,
        estimatedCredits: prepared.estimatedCredits,
        platformLabel: this.formatTurboRunPlatformsLabel(prepared.platforms),
        platforms: prepared.platforms,
        pricingOptions: prepared.pricingOptions,
      },
    };
  }

  private async compensateUnqueuedTurboRun(
    execution: BatchExecution,
    ctx: ToolExecutionContext,
    queueError: unknown,
  ): Promise<AgentToolResult> {
    try {
      await this.turboRunService?.cancelTurboRun(
        execution.turboRunId,
        ctx.organizationId,
      );
    } catch (cancelError) {
      this.loggerService.warn(
        `${this.logContext} failed to cancel a batch that was never queued`,
        {
          turboRunId: execution.turboRunId,
          cancelError,
          organizationId: ctx.organizationId,
        },
      );
    }

    try {
      // The charge is already pinned, so settlement — not release — returns the
      // unspent credits for a run that produced nothing.
      await this.turboRunCreditsService?.settleTurboRunCredits({
        turboRunId: execution.turboRunId,
        organizationId: ctx.organizationId,
        userId: ctx.userId,
      });
    } catch (settleError) {
      this.loggerService.warn(
        `${this.logContext} failed to settle a batch that was never queued`,
        {
          turboRunId: execution.turboRunId,
          organizationId: ctx.organizationId,
          settleError,
        },
      );
    }

    return {
      creditsUsed: 0,
      error:
        queueError instanceof Error
          ? queueError.message
          : 'Turbo run could not be queued',
      success: false,
    };
  }

  private async compensateUnrecordedReservation(params: {
    turboRunId: string;
    organizationId: string;
    reservationId?: string;
  }): Promise<void> {
    if (params.reservationId) {
      try {
        await this.creditsUtilsService?.releaseReservation({
          organizationId: params.organizationId,
          reservationId: params.reservationId,
        });
      } catch (releaseError) {
        this.loggerService.warn(
          `${this.logContext} failed to release an unrecorded batch reservation`,
          { ...params, releaseError },
        );
      }
    }

    try {
      await this.turboRunService?.cancelTurboRun(
        params.turboRunId,
        params.organizationId,
      );
    } catch (cancelError) {
      this.loggerService.warn(
        `${this.logContext} failed to cancel a batch with an unrecorded reservation`,
        { ...params, cancelError },
      );
    }
  }

  private async reserveCreditsOrCancel(params: {
    amount: number;
    turboRunId: string;
    brandId?: string;
    ctx: ToolExecutionContext;
  }): Promise<{ reservationId?: string } | { error: AgentToolResult }> {
    try {
      if (this.creditsUtilsService && params.amount > 0) {
        const reservation = await this.creditsUtilsService.reserveCredits({
          actorUserId: params.ctx.userId,
          amount: params.amount,
          ...(params.brandId ? { brandId: params.brandId } : {}),
          expiresAt: new Date(Date.now() + TURBO_RUN_RESERVATION_TTL_MS),
          idempotencyKey: `turbo-run:${params.turboRunId}`,
          organizationId: params.ctx.organizationId,
          workloadId: params.turboRunId,
          workloadType: 'turbo-run',
        });
        return { reservationId: reservation.id };
      }
      return {};
    } catch (error) {
      try {
        await this.turboRunService?.cancelTurboRun(
          params.turboRunId,
          params.ctx.organizationId,
        );
      } catch (cancelError) {
        this.loggerService.warn(
          `${this.logContext} failed to cancel batch after credit reserve failure`,
          {
            turboRunId: params.turboRunId,
            cancelError,
            organizationId: params.ctx.organizationId,
          },
        );
      }
      return {
        error: {
          creditsUsed: 0,
          error:
            error instanceof Error
              ? error.message
              : `Insufficient credits. This batch needs about ${params.amount} credits.`,
          success: false,
        },
      };
    }
  }

  private async queueOrRunTurboRun(
    execution: BatchExecution,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    try {
      await this.turboRunWorkflowService.queueTurboRun(
        {
          turboRunId: execution.turboRunId,
          organizationId: ctx.organizationId,
          runId: ctx.runId,
          threadId: ctx.threadId,
          userId: ctx.userId,
        },
        SystemWorkflowDispatchClass.INTERACTIVE,
      );
    } catch (queueError) {
      // The queue owns durable execution: without ownership nothing will ever
      // process the run, so unwind the items and the pinned charge here.
      return this.compensateUnqueuedTurboRun(execution, ctx, queueError);
    }
    return {
      creditsUsed: execution.estimatedCredits,
      data: {
        turboRunId: execution.turboRunId,
        estimatedCredits: execution.estimatedCredits,
        message: `Batch created with ${execution.turboRun.totalCount} items. Processing started.`,
        status: execution.turboRun.status,
        totalCount: execution.turboRun.totalCount,
      },
      isBillingDelegated: true,
      success: true,
    };
  }

  private formatTurboRunPlatformsLabel(platforms: string[]): string {
    if (platforms.length === 0) return 'content';
    if (platforms.length === 1) {
      return formatPlatformLabel(platforms[0]) ?? platforms[0];
    }
    return platforms
      .map((platform) => formatPlatformLabel(platform) ?? platform)
      .join(', ');
  }
}
