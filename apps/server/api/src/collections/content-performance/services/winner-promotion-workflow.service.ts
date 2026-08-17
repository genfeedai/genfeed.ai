import { CacheService } from '@api/services/cache/services/cache.service';
import { HarnessWinnerPromotionService } from '@api/services/harness/harness-winner-promotion.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { scopedWhere } from '@genfeedai/server';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, Optional } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';

/** Daily-cadence dedupe window — generous enough to absorb a slow sweep. */
const WINNER_PROMOTION_LOCK_SECONDS = 21_600;
const MAX_BRANDS_PER_SWEEP = 25;
const WINNERS_PER_BRAND = 5;

type WinnerPromotionAction = 'harnessWinnerPromotionSweep';

export interface WinnerPromotionWorkflowResult {
  action: WinnerPromotionAction;
  brandsEligible: number;
  brandsFailed: number;
  brandsPromoted: number;
  organizationId: string;
  promoted: number;
  reason?: string;
  status: 'completed' | 'skipped';
}

/**
 * Org-scoped sweep that promotes each connected brand's top-performing posts
 * into its harness performance-winners context base (#3018). Wraps
 * `HarnessWinnerPromotionService.promoteTopPerformers` — read-only consumer,
 * no changes to harness ownership — so the recurring content loop can close
 * the analytics → winners loop without an operator manually hitting
 * `POST /harness-profiles/promote-winners` per brand.
 */
@Injectable()
export class WinnerPromotionWorkflowService {
  private readonly logContext = 'WinnerPromotionWorkflowService';

  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
    private readonly cacheService: CacheService,
    @Optional()
    private readonly harnessWinnerPromotionService?: HarnessWinnerPromotionService,
    @Optional() private readonly moduleRef?: ModuleRef,
  ) {}

  async runOrganizationWinnerPromotion(
    organizationId: string,
  ): Promise<WinnerPromotionWorkflowResult> {
    const action: WinnerPromotionAction = 'harnessWinnerPromotionSweep';
    const lockKey = this.lockKey(organizationId);
    const acquired = await this.cacheService.acquireLock(
      lockKey,
      WINNER_PROMOTION_LOCK_SECONDS,
    );

    if (!acquired) {
      return this.skipped(
        action,
        organizationId,
        'winner_promotion_already_running',
      );
    }

    try {
      const harnessWinnerPromotionService =
        this.resolveHarnessWinnerPromotionService();

      if (!harnessWinnerPromotionService) {
        return this.skipped(
          action,
          organizationId,
          'harness_winner_promotion_service_unavailable',
        );
      }

      const brandIds = await this.findEligibleBrandIds(organizationId);

      let brandsPromoted = 0;
      let brandsFailed = 0;
      let promoted = 0;

      for (const brandId of brandIds) {
        try {
          const result =
            await harnessWinnerPromotionService.promoteTopPerformers({
              brandId,
              limit: WINNERS_PER_BRAND,
              organizationId,
            });
          promoted += result.promoted;
          brandsPromoted += 1;
        } catch (error: unknown) {
          brandsFailed += 1;
          this.logger.error(
            `${this.logContext} brand winner promotion failed`,
            {
              brandId,
              error: this.errorMessage(error),
              organizationId,
            },
          );
        }
      }

      return {
        action,
        brandsEligible: brandIds.length,
        brandsFailed,
        brandsPromoted,
        organizationId,
        promoted,
        status: 'completed',
      };
    } finally {
      await this.cacheService.releaseLock(lockKey);
    }
  }

  /** Brands in the org with at least one connected credential, capped per sweep. */
  private async findEligibleBrandIds(
    organizationId: string,
  ): Promise<string[]> {
    const connectedCredentials = await this.prisma.credential.findMany({
      distinct: ['brandId'],
      select: { brandId: true },
      where: scopedWhere(organizationId, {
        brandId: { not: null },
        isConnected: true,
      }),
    });

    const candidateBrandIds = connectedCredentials
      .map((credential) => credential.brandId)
      .filter((brandId): brandId is string => typeof brandId === 'string');

    if (candidateBrandIds.length === 0) {
      return [];
    }

    const activeBrands = await this.prisma.brand.findMany({
      select: { id: true },
      take: MAX_BRANDS_PER_SWEEP,
      where: scopedWhere(organizationId, {
        id: { in: candidateBrandIds },
        isActive: true,
      }),
    });

    return activeBrands.map((brand) => brand.id);
  }

  private resolveHarnessWinnerPromotionService():
    | HarnessWinnerPromotionService
    | undefined {
    if (this.harnessWinnerPromotionService) {
      return this.harnessWinnerPromotionService;
    }
    try {
      return this.moduleRef?.get(HarnessWinnerPromotionService, {
        strict: false,
      });
    } catch {
      return undefined;
    }
  }

  private lockKey(organizationId: string): string {
    return `workflow-winner-promotion:${organizationId}`;
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  private skipped(
    action: WinnerPromotionAction,
    organizationId: string,
    reason: string,
  ): WinnerPromotionWorkflowResult {
    return {
      action,
      brandsEligible: 0,
      brandsFailed: 0,
      brandsPromoted: 0,
      organizationId,
      promoted: 0,
      reason,
      status: 'skipped',
    };
  }
}
