import { randomUUID } from 'node:crypto';
import { AdOptimizationAuditLogsService } from '@api/collections/ad-optimization-audit-logs/services/ad-optimization-audit-logs.service';
import { AdOptimizationConfigsService } from '@api/collections/ad-optimization-configs/services/ad-optimization-configs.service';
import type {
  AdOptimizationRecommendation,
  RecommendationType,
} from '@api/collections/ad-optimization-recommendations/schemas/ad-optimization-recommendation.schema';
import { AdOptimizationRecommendationsService } from '@api/collections/ad-optimization-recommendations/services/ad-optimization-recommendations.service';
import type { AdPerformanceDocument } from '@api/collections/ad-performance/schemas/ad-performance.schema';
import { AdPerformanceService } from '@api/collections/ad-performance/services/ad-performance.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { scopedWhere } from '@api/index';
import { GoogleAdsService } from '@api/services/integrations/google-ads/services/google-ads.service';
import { MetaAdsService } from '@api/services/integrations/meta-ads/services/meta-ads.service';
import { TikTokAdsService } from '@api/services/integrations/tiktok-ads/services/tiktok-ads.service';
import { CredentialPlatform } from '@genfeedai/enums';
import {
  type NormalizedAdPerformanceRecord,
  normalizeGoogleAdsCampaignMetricsRecord,
  normalizeMetaCampaignInsightRecord,
} from '@genfeedai/integrations/ads';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import { Injectable } from '@nestjs/common';

type DiscoveredCredential = {
  brandId: string;
  credentialId: string;
  externalHandle?: string;
};

type OptimizationConfig = {
  analysisWindow: number;
  maxBudgetIncreasePct: number;
  maxCpm: number;
  maxDailyBudgetPerCampaign: number;
  maxTotalDailySpend: number;
  minCtr: number;
  minImpressions: number;
  minRoas: number;
  minSpend: number;
};

type AggregatedAdMetrics = {
  avgCpm: number;
  avgCtr: number;
  avgRoas: number;
  entityName: string;
  externalAdId: string;
  hasRoas: boolean;
  totalClicks: number;
  totalImpressions: number;
  totalSpend: number;
};

type PerformanceEnvelope = {
  brandId: string;
  credentialId: string;
  organizationId: string;
  records: NormalizedAdPerformanceRecord[];
};

type SerializableAdOptimizationRecommendation = Omit<
  Partial<AdOptimizationRecommendation>,
  'expiresAt' | 'runDate'
> & {
  expiresAt: string;
  runDate: string;
};

const DEFAULT_SYNC_DAYS = 30;
const EXPIRY_HOURS = 72;

@Injectable()
export class AdAutomationWorkflowService {
  constructor(
    private readonly credentialsService: CredentialsService,
    private readonly adPerformanceService: AdPerformanceService,
    private readonly optimizationConfigService: AdOptimizationConfigsService,
    private readonly recommendationService: AdOptimizationRecommendationsService,
    private readonly auditLogService: AdOptimizationAuditLogsService,
    private readonly metaAdsService: MetaAdsService,
    private readonly googleAdsService: GoogleAdsService,
    private readonly tikTokAdsService: TikTokAdsService,
  ) {}

  async discoverCredentials(
    organizationId: string,
    input: Record<string, unknown>,
  ): Promise<{ credentials: DiscoveredCredential[] }> {
    const platform = this.readPlatform(input.platform);
    const result = await this.credentialsService.findAll(
      {
        where: scopedWhere(organizationId, {
          accessToken: { not: null },
          brandId: { not: null },
          isConnected: true,
          platform,
        }),
      },
      { limit: 100, pagination: false },
    );
    return {
      credentials: result.docs.flatMap((credential) => {
        const credentialId = this.readOptionalString(credential.id);
        const brandId = this.readOptionalString(credential.brandId);
        if (!credentialId || !brandId) {
          return [];
        }
        const externalHandle = this.readOptionalString(
          credential.externalHandle,
        );
        return [
          {
            brandId,
            credentialId,
            ...(externalHandle ? { externalHandle } : {}),
          },
        ];
      }),
    };
  }

  async fetchMeta(
    organizationId: string,
    input: Record<string, unknown>,
  ): Promise<{ provider: 'meta'; rows: Array<Record<string, unknown>> }> {
    const credentials = this.readCredentials(input);
    const rows: Array<Record<string, unknown>> = [];
    const { startDate, endDate } = this.syncRange();
    for (const reference of credentials) {
      const credential = await this.resolveCredential(
        organizationId,
        reference.credentialId,
        CredentialPlatform.FACEBOOK,
      );
      const accessToken = this.decryptRequired(credential.accessToken);
      const accounts = await this.metaAdsService.getAdAccounts(accessToken);
      for (const account of accounts) {
        const campaigns = await this.metaAdsService.listCampaigns(
          accessToken,
          account.id,
          { limit: 100 },
        );
        for (const campaign of campaigns) {
          const insights = await this.metaAdsService.getCampaignInsights(
            accessToken,
            campaign.id,
            { timeRange: { since: startDate, until: endDate } },
          );
          rows.push({
            accountId: account.id,
            brandId: reference.brandId,
            campaign,
            credentialId: reference.credentialId,
            insights,
          });
        }
      }
    }
    return { provider: 'meta', rows };
  }

  async normalizeMeta(
    organizationId: string,
    input: Record<string, unknown>,
  ): Promise<{ performance: PerformanceEnvelope[] }> {
    const rows = this.readRows(input.providerData);
    return {
      performance: rows.map((row) => ({
        brandId: this.requiredString(row.brandId, 'brandId'),
        credentialId: this.requiredString(row.credentialId, 'credentialId'),
        organizationId,
        records: this.readArray(row.insights).map((insight) =>
          normalizeMetaCampaignInsightRecord({
            campaign: row.campaign as Parameters<
              typeof normalizeMetaCampaignInsightRecord
            >[0]['campaign'],
            externalAccountId: this.requiredString(row.accountId, 'accountId'),
            insight: {
              ...(insight as Parameters<
                typeof normalizeMetaCampaignInsightRecord
              >[0]['insight']),
              actionValues: this.readArray(
                (insight as Record<string, unknown>).actionValues,
              ).map((value) => {
                const record = this.readRecord(value);
                return {
                  actionType:
                    this.readOptionalString(record.action_type) ??
                    this.readOptionalString(record.actionType) ??
                    '',
                  value: String(record.value ?? ''),
                };
              }),
            },
          }),
        ),
      })),
    };
  }

  async fetchGoogle(
    organizationId: string,
    input: Record<string, unknown>,
  ): Promise<{ provider: 'google'; rows: Array<Record<string, unknown>> }> {
    const credentials = this.readCredentials(input);
    const rows: Array<Record<string, unknown>> = [];
    const { startDate, endDate } = this.syncRange();
    for (const reference of credentials) {
      const credential = await this.resolveCredential(
        organizationId,
        reference.credentialId,
        CredentialPlatform.GOOGLE_ADS,
      );
      const accessToken = this.decryptRequired(credential.accessToken);
      const customers =
        await this.googleAdsService.listAccessibleCustomers(accessToken);
      for (const customer of customers.filter((item) => !item.isManager)) {
        const campaigns = await this.googleAdsService.listCampaigns(
          accessToken,
          customer.id,
          undefined,
          reference.externalHandle,
        );
        for (const campaign of campaigns) {
          const metrics = await this.googleAdsService.getCampaignMetrics(
            accessToken,
            customer.id,
            campaign.id,
            {
              dateRange: { endDate, startDate },
              limit: 1000,
              segmentByDate: true,
            },
            reference.externalHandle,
          );
          rows.push({
            accountId: customer.id,
            brandId: reference.brandId,
            credentialId: reference.credentialId,
            currency: customer.currencyCode,
            metrics,
          });
        }
      }
    }
    return { provider: 'google', rows };
  }

  async normalizeGoogle(
    organizationId: string,
    input: Record<string, unknown>,
  ): Promise<{ performance: PerformanceEnvelope[] }> {
    const rows = this.readRows(input.providerData);
    return {
      performance: rows.map((row) => ({
        brandId: this.requiredString(row.brandId, 'brandId'),
        credentialId: this.requiredString(row.credentialId, 'credentialId'),
        organizationId,
        records: this.readArray(row.metrics).map((metrics) =>
          normalizeGoogleAdsCampaignMetricsRecord({
            currency: this.requiredString(row.currency, 'currency'),
            externalAccountId: this.requiredString(row.accountId, 'accountId'),
            metrics: metrics as Parameters<
              typeof normalizeGoogleAdsCampaignMetricsRecord
            >[0]['metrics'],
          }),
        ),
      })),
    };
  }

  async fetchTikTok(
    organizationId: string,
    input: Record<string, unknown>,
  ): Promise<{ provider: 'tiktok'; rows: Array<Record<string, unknown>> }> {
    const credentials = this.readCredentials(input);
    const rows: Array<Record<string, unknown>> = [];
    const { startDate, endDate } = this.syncRange();
    for (const reference of credentials) {
      const credential = await this.resolveCredential(
        organizationId,
        reference.credentialId,
        CredentialPlatform.TIKTOK,
      );
      const accessToken = this.decryptRequired(credential.accessToken);
      const accounts = await this.tikTokAdsService.getAdAccounts(accessToken);
      for (const account of accounts) {
        const campaigns = await this.tikTokAdsService.listCampaigns(
          accessToken,
          account.advertiserId,
          { pageSize: 100 },
        );
        for (const campaign of campaigns) {
          const insights = await this.tikTokAdsService.getCampaignInsights(
            accessToken,
            account.advertiserId,
            campaign.campaignId,
            { endDate, pageSize: 1000, startDate },
          );
          rows.push({
            account,
            brandId: reference.brandId,
            campaign,
            credentialId: reference.credentialId,
            insights,
          });
        }
      }
    }
    return { provider: 'tiktok', rows };
  }

  async normalizeTikTok(
    organizationId: string,
    input: Record<string, unknown>,
  ): Promise<{ performance: PerformanceEnvelope[] }> {
    const rows = this.readRows(input.providerData);
    return {
      performance: rows.map((row) => {
        const account = this.readRecord(row.account);
        const campaign = this.readRecord(row.campaign);
        const spendRecords = this.readArray(row.insights).map((value) => {
          const insight = this.readRecord(value);
          const spend = this.readNumber(insight.spend);
          const conversions = this.readNumber(insight.conversions);
          const campaignObjective = this.readOptionalString(campaign.objective);
          const campaignStatus = this.readOptionalString(campaign.status);
          return {
            campaignName: this.requiredString(
              campaign.campaignName,
              'campaignName',
            ),
            ...(campaignObjective ? { campaignObjective } : {}),
            ...(campaignStatus ? { campaignStatus } : {}),
            clicks: this.readNumber(insight.clicks),
            conversions,
            ...(conversions > 0
              ? { cpa: this.readNumber(insight.costPerConversion) }
              : {}),
            cpc: this.readNumber(insight.cpc),
            cpm: this.readNumber(insight.cpm),
            ctr: this.readNumber(insight.ctr),
            currency: this.readOptionalString(account.currency) ?? 'USD',
            dataConfidence: 0.7,
            date: this.requiredString(insight.statTimeDay, 'statTimeDay'),
            externalAccountId: this.requiredString(
              account.advertiserId,
              'advertiserId',
            ),
            externalCampaignId: this.requiredString(
              campaign.campaignId,
              'campaignId',
            ),
            granularity: 'campaign' as const,
            impressions: this.readNumber(insight.impressions),
            platform: 'tiktok' as const,
            spend,
          } satisfies NormalizedAdPerformanceRecord;
        });
        return {
          brandId: this.requiredString(row.brandId, 'brandId'),
          credentialId: this.requiredString(row.credentialId, 'credentialId'),
          organizationId,
          records: spendRecords,
        };
      }),
    };
  }

  async persistPerformance(
    organizationId: string,
    input: Record<string, unknown>,
  ): Promise<{ persisted: number }> {
    const envelopes = this.readPerformance(input.performance);
    let persisted = 0;
    for (const envelope of envelopes) {
      if (envelope.organizationId !== organizationId) {
        throw new Error('Ad performance organization scope mismatch');
      }
      const records = envelope.records.map((record) => ({
        adPlatform: record.platform,
        bodyText: record.bodyText,
        brandId: envelope.brandId,
        campaignName: record.campaignName,
        campaignObjective: record.campaignObjective,
        campaignStatus: record.campaignStatus,
        clicks: record.clicks,
        conversions: record.conversions,
        cpa: record.cpa,
        cpc: record.cpc,
        cpm: record.cpm,
        credentialId: envelope.credentialId,
        ctaText: record.ctaText,
        ctr: record.ctr,
        currency: record.currency,
        dataConfidence: record.dataConfidence,
        date: new Date(record.date),
        externalAccountId: record.externalAccountId,
        externalAdId: record.externalAdId,
        externalAdSetId: record.externalAdSetId,
        externalCampaignId: record.externalCampaignId,
        granularity: record.granularity,
        headlineText: record.headlineText,
        impressions: record.impressions,
        organizationId,
        revenue: record.revenue,
        roas: record.roas,
        spend: record.spend,
      }));
      if (records.length > 0) {
        persisted += await this.adPerformanceService.upsertBatch(records);
      }
    }
    return { persisted };
  }

  async loadOptimizationConfig(organizationId: string): Promise<{
    config: OptimizationConfig;
    runId: string;
    startedAt: string;
  }> {
    const config =
      await this.optimizationConfigService.findByOrganization(organizationId);
    if (!config?.isEnabled) {
      throw new Error(
        `Ad optimization is not enabled for organization ${organizationId}`,
      );
    }
    return {
      config: {
        analysisWindow: config.analysisWindow,
        maxBudgetIncreasePct: config.maxBudgetIncreasePct,
        maxCpm: config.maxCpm,
        maxDailyBudgetPerCampaign: config.maxDailyBudgetPerCampaign,
        maxTotalDailySpend: config.maxTotalDailySpend,
        minCtr: config.minCtr,
        minImpressions: config.minImpressions,
        minRoas: config.minRoas,
        minSpend: config.minSpend,
      },
      runId: randomUUID(),
      startedAt: new Date().toISOString(),
    };
  }

  async analyzeOptimization(
    organizationId: string,
    input: Record<string, unknown>,
  ): Promise<{
    adsAnalyzed: number;
    recommendations: SerializableAdOptimizationRecommendation[];
    runId: string;
  }> {
    const optimization = this.readRecord(input.optimization);
    const config = this.readOptimizationConfig(optimization.config);
    const runId = this.requiredString(optimization.runId, 'runId');
    const windowStart = new Date();
    windowStart.setDate(windowStart.getDate() - config.analysisWindow);
    const performance = await this.adPerformanceService.findByOrganization(
      organizationId,
      { granularity: 'ad', limit: 10_000, startDate: windowStart },
    );
    const qualified = this.aggregateByAd(performance).filter(
      (ad) =>
        ad.totalSpend >= config.minSpend &&
        ad.totalImpressions >= config.minImpressions,
    );
    const recommendations: SerializableAdOptimizationRecommendation[] = [];
    for (const ad of qualified) {
      const reasons: string[] = [];
      if (ad.avgCpm > config.maxCpm) {
        reasons.push(
          `CPM ${ad.avgCpm.toFixed(2)} exceeds max ${config.maxCpm}`,
        );
      }
      if (ad.avgCtr < config.minCtr) {
        reasons.push(
          `CTR ${ad.avgCtr.toFixed(2)}% below min ${config.minCtr}%`,
        );
      }
      if (ad.hasRoas && ad.avgRoas < config.minRoas) {
        reasons.push(
          `ROAS ${ad.avgRoas.toFixed(2)} below min ${config.minRoas}`,
        );
      }
      if (
        reasons.length > 0 &&
        !(await this.recommendationService.findExistingPending(
          organizationId,
          ad.externalAdId,
          'pause',
        ))
      ) {
        recommendations.push(
          this.recommendation(
            organizationId,
            runId,
            'pause',
            ad,
            reasons.join('; '),
          ),
        );
      }
    }
    const ranked = qualified
      .filter((ad) => ad.hasRoas)
      .sort((left, right) => right.avgRoas - left.avgRoas)
      .slice(0, Math.max(1, Math.ceil(qualified.length * 0.1)));
    for (const ad of ranked) {
      if (ad.avgRoas <= config.minRoas * 2) {
        continue;
      }
      if (
        !(await this.recommendationService.findExistingPending(
          organizationId,
          ad.externalAdId,
          'promote',
        ))
      ) {
        recommendations.push(
          this.recommendation(
            organizationId,
            runId,
            'promote',
            ad,
            `Top performer: ROAS ${ad.avgRoas.toFixed(2)}`,
          ),
        );
      }
      if (
        !(await this.recommendationService.findExistingPending(
          organizationId,
          ad.externalAdId,
          'budget_increase',
        ))
      ) {
        const increase = Math.min(
          config.maxBudgetIncreasePct,
          Math.round((ad.avgRoas / config.minRoas - 1) * 10),
        );
        recommendations.push(
          this.recommendation(
            organizationId,
            runId,
            'budget_increase',
            ad,
            `High ROAS ${ad.avgRoas.toFixed(2)} warrants ${increase}% budget increase`,
            {
              budgetIncreasePct: increase,
              maxDailyBudget: config.maxDailyBudgetPerCampaign,
            },
          ),
        );
      }
    }
    return { adsAnalyzed: qualified.length, recommendations, runId };
  }

  async persistOptimizationRecommendations(
    _organizationId: string,
    input: Record<string, unknown>,
  ): Promise<{ recommendationsGenerated: number }> {
    const analysis = this.readRecord(input.analysis);
    const recommendations = Array.isArray(analysis.recommendations)
      ? (analysis.recommendations as SerializableAdOptimizationRecommendation[])
      : [];
    const recommendationsGenerated =
      recommendations.length > 0
        ? await this.recommendationService.createBatch(recommendations)
        : 0;
    await this.recommendationService.expireStale();
    return { recommendationsGenerated };
  }

  async finalizeOptimization(
    organizationId: string,
    input: Record<string, unknown>,
  ): Promise<{
    adsAnalyzed: number;
    recommendationsGenerated: number;
    runId: string;
    status: 'completed';
  }> {
    const optimization = this.readRecord(input.optimization);
    const analysis = this.readRecord(input.analysis);
    const persistence = this.readRecord(input.persistence);
    const runId = this.requiredString(analysis.runId, 'runId');
    const startedAt = new Date(
      this.requiredString(optimization.startedAt, 'startedAt'),
    );
    const adsAnalyzed = this.readNumber(analysis.adsAnalyzed);
    const recommendationsGenerated = this.readNumber(
      persistence.recommendationsGenerated,
    );
    await this.auditLogService.create({
      data: {
        adsAnalyzed,
        configSnapshot: this.readRecord(optimization.config),
        durationMs: Date.now() - startedAt.getTime(),
        errors: [],
        recommendationsGenerated,
        runDate: new Date(),
        runId,
      },
      organizationId,
    });
    return {
      adsAnalyzed,
      recommendationsGenerated,
      runId,
      status: 'completed',
    };
  }

  private async resolveCredential(
    organizationId: string,
    credentialId: string,
    platform: CredentialPlatform,
  ) {
    const credential = await this.credentialsService.findOne({
      id: credentialId,
      isConnected: true,
      isDeleted: false,
      organizationId,
      platform,
    });
    if (!credential) {
      throw new Error(`Credential ${credentialId} is unavailable`);
    }
    return credential;
  }

  private aggregateByAd(
    records: AdPerformanceDocument[],
  ): AggregatedAdMetrics[] {
    const grouped = new Map<string, AdPerformanceDocument[]>();
    for (const record of records) {
      if (record.externalAdId) {
        grouped.set(record.externalAdId, [
          ...(grouped.get(record.externalAdId) ?? []),
          record,
        ]);
      }
    }
    return [...grouped.entries()].map(([externalAdId, items]) => {
      const totalSpend = items.reduce(
        (sum, item) => sum + (item.spend ?? 0),
        0,
      );
      const totalImpressions = items.reduce(
        (sum, item) => sum + (item.impressions ?? 0),
        0,
      );
      const totalClicks = items.reduce(
        (sum, item) => sum + (item.clicks ?? 0),
        0,
      );
      const totalRevenue = items.reduce(
        (sum, item) => sum + (item.revenue ?? 0),
        0,
      );
      return {
        avgCpm:
          totalImpressions > 0 ? (totalSpend / totalImpressions) * 1000 : 0,
        avgCtr:
          totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0,
        avgRoas: totalSpend > 0 ? totalRevenue / totalSpend : 0,
        entityName: items[0]?.campaignName ?? externalAdId,
        externalAdId,
        hasRoas: items.some((item) => item.roas !== undefined),
        totalClicks,
        totalImpressions,
        totalSpend,
      };
    });
  }

  private recommendation(
    organizationId: string,
    runId: string,
    type: RecommendationType,
    ad: AggregatedAdMetrics,
    reason: string,
    suggestedAction?: Record<string, unknown>,
  ): SerializableAdOptimizationRecommendation {
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + EXPIRY_HOURS);
    return {
      entityId: ad.externalAdId,
      entityName: ad.entityName,
      entityType: 'ad',
      expiresAt: expiresAt.toISOString(),
      metrics: {
        clicks: ad.totalClicks,
        cpm: ad.avgCpm,
        ctr: ad.avgCtr,
        impressions: ad.totalImpressions,
        roas: ad.avgRoas,
        spend: ad.totalSpend,
      },
      organizationId,
      reason,
      recommendationType: type,
      runDate: new Date().toISOString(),
      runId,
      status: 'pending',
      ...(suggestedAction ? { suggestedAction } : {}),
    };
  }

  private readCredentials(value: unknown): DiscoveredCredential[] {
    const record = this.readRecord(value);
    if (record.item !== undefined) {
      return [this.readCredentialReference(record.item)];
    }
    if (!Array.isArray(record.credentials)) {
      return [this.readCredentialReference(value)];
    }
    return record.credentials.map((credential) =>
      this.readCredentialReference(credential),
    );
  }

  private readCredentialReference(value: unknown): DiscoveredCredential {
    const credential = this.readRecord(value);
    const externalHandle = this.readOptionalString(credential.externalHandle);
    return {
      brandId: this.requiredString(credential.brandId, 'brandId'),
      credentialId: this.requiredString(
        credential.credentialId,
        'credentialId',
      ),
      ...(externalHandle ? { externalHandle } : {}),
    };
  }

  private readRows(value: unknown): Array<Record<string, unknown>> {
    const record = this.readRecord(value);
    if (!Array.isArray(record.rows)) {
      throw new Error('Ad normalization requires provider rows');
    }
    return record.rows.map((row) => this.readRecord(row));
  }

  private readPerformance(value: unknown): PerformanceEnvelope[] {
    const record = this.readRecord(value);
    if (!Array.isArray(record.performance)) {
      throw new Error('Ad persistence requires normalized performance');
    }
    return record.performance as PerformanceEnvelope[];
  }

  private readOptimizationConfig(value: unknown): OptimizationConfig {
    const config = this.readRecord(value);
    return {
      analysisWindow: this.readNumber(config.analysisWindow),
      maxBudgetIncreasePct: this.readNumber(config.maxBudgetIncreasePct),
      maxCpm: this.readNumber(config.maxCpm),
      maxDailyBudgetPerCampaign: this.readNumber(
        config.maxDailyBudgetPerCampaign,
      ),
      maxTotalDailySpend: this.readNumber(config.maxTotalDailySpend),
      minCtr: this.readNumber(config.minCtr),
      minImpressions: this.readNumber(config.minImpressions),
      minRoas: this.readNumber(config.minRoas),
      minSpend: this.readNumber(config.minSpend),
    };
  }

  private readPlatform(value: unknown): CredentialPlatform {
    if (
      value === CredentialPlatform.FACEBOOK ||
      value === CredentialPlatform.GOOGLE_ADS ||
      value === CredentialPlatform.TIKTOK
    ) {
      return value;
    }
    throw new Error('Ad credential discovery requires a supported platform');
  }

  private syncRange(): { endDate: string; startDate: string } {
    const end = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const start = new Date(end);
    start.setDate(start.getDate() - DEFAULT_SYNC_DAYS);
    return {
      endDate: end.toISOString().slice(0, 10),
      startDate: start.toISOString().slice(0, 10),
    };
  }

  private decryptRequired(value: unknown): string {
    const encrypted = this.requiredString(value, 'accessToken');
    return EncryptionUtil.decrypt(encrypted);
  }

  private readRecord(value: unknown): Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private readArray(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
  }

  private readNumber(value: unknown): number {
    const numeric = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(numeric) ? numeric : 0;
  }

  private readOptionalString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim().length > 0
      ? value
      : undefined;
  }

  private requiredString(value: unknown, field: string): string {
    const resolved = this.readOptionalString(value);
    if (!resolved) {
      throw new Error(`Ad workflow requires ${field}`);
    }
    return resolved;
  }
}
