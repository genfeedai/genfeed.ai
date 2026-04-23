import { AdOptimizationAuditLogsService } from '@api/collections/ad-optimization-audit-logs/services/ad-optimization-audit-logs.service';
import { type AdOptimizationConfigDocument } from '@api/collections/ad-optimization-configs/schemas/ad-optimization-config.schema';
import { AdOptimizationConfigsService } from '@api/collections/ad-optimization-configs/services/ad-optimization-configs.service';
import type {
  AdOptimizationRecommendation,
  RecommendationType,
} from '@api/collections/ad-optimization-recommendations/schemas/ad-optimization-recommendation.schema';
import { AdOptimizationRecommendationsService } from '@api/collections/ad-optimization-recommendations/services/ad-optimization-recommendations.service';
import { type AdPerformanceDocument } from '@api/collections/ad-performance/schemas/ad-performance.schema';
import { AdPerformanceService } from '@api/collections/ad-performance/services/ad-performance.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Job } from 'bullmq';

export interface AdOptimizationJobData {
  organizationId: string;
  configId: string;
  runId: string;
}

interface AggregatedAdMetrics {
  externalAdId: string;
  entityName: string;
  totalSpend: number;
  totalImpressions: number;
  totalClicks: number;
  avgCpm: number;
  avgCtr: number;
  avgRoas: number;
  hasRoas: boolean;
}

@Injectable()
@Processor('ad-optimization')
export class AdOptimizationProcessor extends WorkerHost {
  private readonly EXPIRY_HOURS = 72;

  constructor(
    private readonly logger: LoggerService,
    private readonly adPerformanceService: AdPerformanceService,
    private readonly optimizationConfigService: AdOptimizationConfigsService,
    private readonly recommendationService: AdOptimizationRecommendationsService,
    private readonly auditLogService: AdOptimizationAuditLogsService,
  ) {
    super();
  }

  async process(job: Job<AdOptimizationJobData>): Promise<void> {
    const startTime = Date.now();
    const { organizationId, configId, runId } = job.data;

    this.logger.log(
      `Processing ad optimization run ${runId} for org ${organizationId}`,
    );

    const errors: Array<{ message: string; timestamp: Date }> = [];

    try {
      const config =
        await this.optimizationConfigService.findByOrganization(organizationId);

      if (!config) {
        this.logger.warn(
          `No optimization config found for org ${organizationId}, skipping`,
        );
        return;
      }

      const windowStart = new Date();
      windowStart.setDate(windowStart.getDate() - config.analysisWindow);

      const performanceData =
        await this.adPerformanceService.findByOrganization(organizationId, {
          granularity: 'ad',
          limit: 10000,
          startDate: windowStart,
        });

      const aggregated = this.aggregateByAd(performanceData);
      const qualifiedAds = aggregated.filter(
        (ad) =>
          ad.totalSpend >= config.minSpend &&
          ad.totalImpressions >= config.minImpressions,
      );

      this.logger.log(
        `Run ${runId}: ${performanceData.length} records, ${aggregated.length} ads, ${qualifiedAds.length} qualified`,
      );

      const recommendations: Partial<AdOptimizationRecommendation>[] = [];

      // Pass 1: Identify underperformers
      for (const ad of qualifiedAds) {
        const pauseReasons: string[] = [];

        if (ad.avgCpm > config.maxCpm) {
          pauseReasons.push(
            `CPM ${ad.avgCpm.toFixed(2)} exceeds max ${config.maxCpm}`,
          );
        }
        if (ad.avgCtr < config.minCtr) {
          pauseReasons.push(
            `CTR ${ad.avgCtr.toFixed(2)}% below min ${config.minCtr}%`,
          );
        }
        if (ad.hasRoas && ad.avgRoas < config.minRoas) {
          pauseReasons.push(
            `ROAS ${ad.avgRoas.toFixed(2)} below min ${config.minRoas}`,
          );
        }

        if (pauseReasons.length > 0) {
          const existing = await this.recommendationService.findExistingPending(
            organizationId,
            ad.externalAdId,
            'pause',
          );

          if (!existing) {
            recommendations.push(
              this.buildRecommendation(
                organizationId,
                runId,
                'pause',
                ad,
                pauseReasons.join('; '),
              ),
            );
          }
        }
      }

      // Pass 2: Identify top performers for promotion / budget increase
      const adsWithRoas = qualifiedAds.filter((ad) => ad.hasRoas);
      if (adsWithRoas.length > 0) {
        const sortedByRoas = [...adsWithRoas].sort(
          (a, b) => b.avgRoas - a.avgRoas,
        );
        const topTenPctCount = Math.max(
          1,
          Math.ceil(sortedByRoas.length * 0.1),
        );
        const topPerformers = sortedByRoas.slice(0, topTenPctCount);

        for (const ad of topPerformers) {
          if (ad.avgRoas > config.minRoas * 2) {
            const existingPromote =
              await this.recommendationService.findExistingPending(
                organizationId,
                ad.externalAdId,
                'promote',
              );

            if (!existingPromote) {
              recommendations.push(
                this.buildRecommendation(
                  organizationId,
                  runId,
                  'promote',
                  ad,
                  `Top performer: ROAS ${ad.avgRoas.toFixed(2)} is ${(ad.avgRoas / config.minRoas).toFixed(1)}x above threshold`,
                ),
              );
            }

            const existingBudget =
              await this.recommendationService.findExistingPending(
                organizationId,
                ad.externalAdId,
                'budget_increase',
              );

            if (!existingBudget) {
              const suggestedIncrease = Math.min(
                config.maxBudgetIncreasePct,
                Math.round((ad.avgRoas / config.minRoas - 1) * 10),
              );

              recommendations.push(
                this.buildRecommendation(
                  organizationId,
                  runId,
                  'budget_increase',
                  ad,
                  `High ROAS ${ad.avgRoas.toFixed(2)} warrants ${suggestedIncrease}% budget increase`,
                  {
                    budgetIncreasePct: suggestedIncrease,
                    maxDailyBudget: config.maxDailyBudgetPerCampaign,
                  },
                ),
              );
            }
          }
        }
      }

      let insertedCount = 0;
      if (recommendations.length > 0) {
        try {
          insertedCount =
            await this.recommendationService.createBatch(recommendations);
        } catch (error: unknown) {
          errors.push({
            message: `Failed to insert recommendations: ${(error as Error).message}`,
            timestamp: new Date(),
          });
        }
      }

      // Expire stale recommendations
      await this.recommendationService.expireStale();

      const durationMs = Date.now() - startTime;

      await this.auditLogService.create({
        adsAnalyzed: qualifiedAds.length,
        configSnapshot: this.snapshotConfig(config),
        durationMs,
        errors,
        organization: organizationId,
        recommendationsGenerated: insertedCount,
        runDate: new Date(),
        runId,
      });

      this.logger.log(
        `Ad optimization run ${runId} completed in ${durationMs}ms: ${qualifiedAds.length} ads analyzed, ${insertedCount} recommendations`,
      );
    } catch (error: unknown) {
      const durationMs = Date.now() - startTime;
      errors.push({
        message: (error as Error).message,
        timestamp: new Date(),
      });

      await this.auditLogService.create({
        adsAnalyzed: 0,
        durationMs,
        errors,
        organization: organizationId,
        recommendationsGenerated: 0,
        runDate: new Date(),
        runId,
      });

      this.logger.error(
        `Ad optimization run ${runId} failed`,
        (error as Error).message,
      );
      throw error;
    }
  }

  private aggregateByAd(
    records: AdPerformanceDocument[],
  ): AggregatedAdMetrics[] {
    const byAd = new Map<string, AdPerformanceDocument[]>();

    for (const record of records) {
      if (!record.externalAdId) continue;
      const existing = byAd.get(record.externalAdId) || [];
      existing.push(record);
      byAd.set(record.externalAdId, existing);
    }

    const results: AggregatedAdMetrics[] = [];

    for (const [adId, adRecords] of byAd) {
      const totalSpend = adRecords.reduce((sum, r) => sum + (r.spend ?? 0), 0);
      const totalImpressions = adRecords.reduce(
        (sum, r) => sum + (r.impressions ?? 0),
        0,
      );
      const totalClicks = adRecords.reduce(
        (sum, r) => sum + (r.clicks ?? 0),
        0,
      );
      const totalRevenue = adRecords.reduce(
        (sum, r) => sum + (r.revenue || 0),
        0,
      );
      const hasRoas = adRecords.some((r) => r.roas !== undefined);

      results.push({
        avgCpm:
          totalImpressions > 0 ? (totalSpend / totalImpressions) * 1000 : 0,
        avgCtr:
          totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0,
        avgRoas: totalSpend > 0 ? totalRevenue / totalSpend : 0,
        entityName: adRecords[0]?.campaignName || adId,
        externalAdId: adId,
        hasRoas,
        totalClicks,
        totalImpressions,
        totalSpend,
      });
    }

    return results;
  }

  private buildRecommendation(
    organizationId: string,
    runId: string,
    type: RecommendationType,
    ad: AggregatedAdMetrics,
    reason: string,
    suggestedAction?: Record<string, unknown>,
  ): Partial<AdOptimizationRecommendation> {
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + this.EXPIRY_HOURS);

    return {
      entityId: ad.externalAdId,
      entityName: ad.entityName,
      entityType: 'ad',
      expiresAt,
      metrics: {
        clicks: ad.totalClicks,
        cpm: ad.avgCpm,
        ctr: ad.avgCtr,
        impressions: ad.totalImpressions,
        roas: ad.avgRoas,
        spend: ad.totalSpend,
      },
      organization: organizationId,
      reason,
      recommendationType: type,
      runDate: new Date(),
      runId,
      status: 'pending',
      ...(suggestedAction && { suggestedAction }),
    };
  }

  private snapshotConfig(
    config: AdOptimizationConfigDocument,
  ): Record<string, unknown> {
    return {
      analysisWindow: config.analysisWindow,
      maxBudgetIncreasePct: config.maxBudgetIncreasePct,
      maxCpm: config.maxCpm,
      maxDailyBudgetPerCampaign: config.maxDailyBudgetPerCampaign,
      maxTotalDailySpend: config.maxTotalDailySpend,
      minCtr: config.minCtr,
      minImpressions: config.minImpressions,
      minRoas: config.minRoas,
      minSpend: config.minSpend,
    };
  }
}
