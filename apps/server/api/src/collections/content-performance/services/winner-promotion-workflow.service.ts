import { AUTOMATION_WORKFLOW_IDS } from '@api/collections/workflows/services/automation-workflow-definitions';
import { scopedWhere } from '@api/index';
import { CacheService } from '@api/services/cache/cache.service';
import type { WinnerPromotionCandidate } from '@api/services/harness/harness-winner-promotion.service';
import { HarnessWinnerPromotionService } from '@api/services/harness/harness-winner-promotion.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { Injectable, Optional } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';

/** Daily-cadence dedupe window — generous enough to absorb a slow sweep. */
const WINNER_PROMOTION_LOCK_SECONDS = 21_600;
const MAX_BRANDS_PER_SWEEP = 25;
const WINNERS_PER_BRAND = 5;

type WinnerPromotionAction = typeof AUTOMATION_WORKFLOW_IDS.HARNESS_WINNERS;

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
 * Org-scoped workflow actions that discover connected brands and promote each
 * ranked winner through an explicit child workflow into the harness
 * performance-winners context base (#3018).
 */
@Injectable()
export class WinnerPromotionWorkflowService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: CacheService,
    @Optional()
    private readonly harnessWinnerPromotionService?: HarnessWinnerPromotionService,
    @Optional() private readonly moduleRef?: ModuleRef,
  ) {}

  async beginOrganizationWinnerPromotion(
    organizationId: string,
  ): Promise<Record<string, unknown>> {
    const lockKey = this.lockKey(organizationId);
    const acquired = await this.cacheService.acquireLock(
      lockKey,
      WINNER_PROMOTION_LOCK_SECONDS,
    );
    return { acquired, lockKey, organizationId };
  }

  async discoverEligibleWinnerBrands(
    organizationId: string,
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    if (this.readRecord(input.state).acquired !== true)
      return { baseInput: { organizationId }, items: [] };
    if (!this.resolveHarnessWinnerPromotionService()) {
      return {
        baseInput: { organizationId },
        items: [],
        reason: 'harness_winner_promotion_service_unavailable',
      };
    }
    const items = await this.findEligibleBrandIds(organizationId);
    return { baseInput: { organizationId }, items };
  }

  async prepareBrandWinners(
    organizationId: string,
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const brandId = this.requiredString(input.item, 'brandId');
    const service = this.resolveHarnessWinnerPromotionService();
    if (!service)
      throw new Error('HarnessWinnerPromotionService is unavailable');
    const platform =
      typeof input.platform === 'string' && input.platform.trim()
        ? input.platform
        : undefined;
    const discovery = await service.discoverTopPerformers({
      brandId,
      limit: typeof input.limit === 'number' ? input.limit : WINNERS_PER_BRAND,
      organizationId,
      ...(platform ? { platform } : {}),
    });
    return {
      baseInput: {
        contextBaseId: discovery.contextBaseId,
        organizationId,
      },
      brandId,
      items: discovery.items,
      skipped: discovery.skipped,
    };
  }

  async promoteWinnerItem(
    organizationId: string,
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const service = this.resolveHarnessWinnerPromotionService();
    if (!service)
      throw new Error('HarnessWinnerPromotionService is unavailable');
    return service.promoteTopPerformer(
      organizationId,
      this.requiredString(input.contextBaseId, 'contextBaseId'),
      this.readRecord(input.item) as unknown as WinnerPromotionCandidate,
    );
  }

  finalizeBrandWinners(
    input: Record<string, unknown>,
  ): Record<string, unknown> {
    const state = this.readRecord(input.state);
    const results = this.readBatchResults(input.batch).map((entry) =>
      this.readRecord(entry.result),
    );
    return {
      brandId: state.brandId,
      promoted: results.reduce(
        (total, result) =>
          total + (typeof result.promoted === 'number' ? result.promoted : 0),
        0,
      ),
      skipped:
        (typeof state.skipped === 'number' ? state.skipped : 0) +
        results.reduce(
          (total, result) =>
            total + (typeof result.skipped === 'number' ? result.skipped : 0),
          0,
        ),
      status: 'promoted',
    };
  }

  async finalizeOrganizationWinnerPromotion(
    organizationId: string,
    input: Record<string, unknown>,
  ): Promise<WinnerPromotionWorkflowResult> {
    const state = this.readRecord(input.state);
    const discovery = this.readRecord(input.discovery);
    const results = this.readBatchResults(input.batch).map((entry) =>
      this.readRecord(entry.result),
    );
    if (state.acquired === true)
      await this.cacheService.releaseLock(this.lockKey(organizationId));
    if (state.acquired !== true)
      return this.skipped(
        AUTOMATION_WORKFLOW_IDS.HARNESS_WINNERS,
        organizationId,
        'winner_promotion_already_running',
      );
    if (typeof discovery.reason === 'string')
      return this.skipped(
        AUTOMATION_WORKFLOW_IDS.HARNESS_WINNERS,
        organizationId,
        discovery.reason,
      );
    return {
      action: AUTOMATION_WORKFLOW_IDS.HARNESS_WINNERS,
      brandsEligible: results.length,
      brandsFailed: results.filter((result) => result.status === 'failed')
        .length,
      brandsPromoted: results.filter((result) => result.status === 'promoted')
        .length,
      organizationId,
      promoted: results.reduce(
        (sum, result) =>
          sum + (typeof result.promoted === 'number' ? result.promoted : 0),
        0,
      ),
      status: 'completed',
    };
  }

  async failOrganizationWinnerPromotion(
    organizationId: string,
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const acquired = this.readRecord(input.state).acquired === true;
    if (acquired)
      await this.cacheService.releaseLock(this.lockKey(organizationId));
    return { organizationId, released: acquired };
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

  private readBatchResults(value: unknown): Array<{ result?: unknown }> {
    const batch = this.readRecord(value);
    return Array.isArray(batch.results)
      ? (batch.results as Array<{ result?: unknown }>)
      : [];
  }

  private readRecord(value: unknown): Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private requiredString(value: unknown, field: string): string {
    if (typeof value !== 'string' || value.length === 0)
      throw new Error(`${field} is required`);
    return value;
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
