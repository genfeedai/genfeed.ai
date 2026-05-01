import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CacheService } from '@api/services/cache/services/cache.service';
import { ContentExecutionService } from '@api/services/content-engine/content-execution.service';
import { ContentPlannerService } from '@api/services/content-engine/content-planner.service';
import { ContentReviewService } from '@api/services/content-engine/content-review.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

const MAX_BRANDS_PER_CYCLE = 10;

@Injectable()
export class CronContentEngineService {
  private static readonly LOCK_KEY = 'cron:content-engine';
  private static readonly LOCK_TTL_SECONDS = 900; // 15 minutes

  constructor(
    private readonly brandsService: BrandsService,
    private readonly contentPlannerService: ContentPlannerService,
    private readonly contentExecutionService: ContentExecutionService,
    private readonly contentReviewService: ContentReviewService,
    private readonly cacheService: CacheService,
    private readonly logger: LoggerService,
  ) {}

  /**
   * Main cron entry point — runs every 30 minutes.
   * Finds brands with active content strategy and auto-publish enabled,
   * generates plans if needed, and executes pending items.
   */
  @Cron(CronExpression.EVERY_30_MINUTES)
  async processContentEngine(): Promise<void> {
    const acquired = await this.cacheService.acquireLock(
      CronContentEngineService.LOCK_KEY,
      CronContentEngineService.LOCK_TTL_SECONDS,
    );

    if (!acquired) {
      this.logger.debug(
        'Content engine cron already running (lock held), skipping',
        'CronContentEngineService',
      );
      return;
    }

    const startTime = Date.now();

    try {
      this.logger.log(
        'Starting content engine cycle',
        'CronContentEngineService',
      );

      const brands = await this.brandsService.find({
        isActive: true,
        isDeleted: false,
      });

      const eligibleBrands = brands
        .filter((brand) => {
          const agentConfig = brand.agentConfig as
            | {
                autoPublish?: { enabled?: boolean };
                strategy?: { contentTypes?: unknown[] };
              }
            | undefined;

          return (
            agentConfig?.autoPublish?.enabled === true &&
            Array.isArray(agentConfig.strategy?.contentTypes) &&
            agentConfig.strategy.contentTypes.length > 0
          );
        })
        .slice(0, MAX_BRANDS_PER_CYCLE);

      this.logger.log(
        `Found ${eligibleBrands.length} brands with active content strategy`,
        'CronContentEngineService',
      );

      for (const brand of eligibleBrands) {
        try {
          await this.processBrand(brand);
        } catch (error: unknown) {
          const message =
            error instanceof Error ? error.message : 'Unknown error';
          this.logger.error(
            `Brand ${brand._id} content engine failed: ${message}`,
            'CronContentEngineService',
          );
        }
      }

      const duration = Date.now() - startTime;
      this.logger.log(
        `Content engine cycle completed in ${duration}ms (${eligibleBrands.length} brands)`,
        'CronContentEngineService',
      );
    } catch (error: unknown) {
      this.logger.error(
        'Content engine cycle failed',
        error,
        'CronContentEngineService',
      );
    } finally {
      await this.cacheService.releaseLock(CronContentEngineService.LOCK_KEY);
    }
  }

  private async processBrand(brand: {
    _id: string;
    organization: { toString: () => string };
    user?: { toString: () => string };
    agentConfig?: {
      strategy?: {
        contentTypes?: string[];
        platforms?: string[];
        frequency?: string;
        goals?: string[];
      };
    };
  }): Promise<void> {
    const brandId = String(brand._id);
    const organizationId = brand.organization.toString();
    const userId = brand.user?.toString() ?? organizationId;
    const strategy = brand.agentConfig?.strategy;

    if (!strategy?.contentTypes?.length) {
      return;
    }

    const now = new Date();
    const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const { plan, items } = await this.contentPlannerService.generatePlan(
      organizationId,
      brandId,
      userId,
      {
        itemCount: 5,
        periodEnd: weekFromNow.toISOString(),
        periodStart: now.toISOString(),
        platforms: strategy.platforms,
        topics: strategy.goals,
      },
    );

    this.logger.log(
      `Generated plan ${plan._id} with ${items.length} items for brand ${brandId}`,
      'CronContentEngineService',
    );

    const result = await this.contentExecutionService.executePlan(
      organizationId,
      brandId,
      String(plan._id),
      userId,
    );

    // Auto-approve eligible drafts
    for (const executionResult of result.results) {
      if (executionResult.contentDraftId) {
        await this.contentReviewService.autoApproveIfEligible(
          organizationId,
          brandId,
          executionResult.contentDraftId,
        );
      }
    }

    this.logger.log(
      `Brand ${brandId}: ${result.summary.completed}/${result.summary.total} items executed`,
      'CronContentEngineService',
    );
  }
}
