import { AdPerformanceService } from '@api/collections/ad-performance/services/ad-performance.service';
import { CreativePatternsService } from '@api/collections/creative-patterns/creative-patterns.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { WorkflowsService } from '@api/collections/workflows/services/workflows.service';
import { AdsGatewayService } from '@api/services/ads-gateway/ads-gateway.service';
import { WorkflowStatus, WorkflowTrigger } from '@genfeedai/enums';
import type {
  AdsAdapterContext,
  AdsPlatform,
  UnifiedAd,
} from '@genfeedai/interfaces';
import type {
  AdPack,
  AdsChannel,
  AdsResearchDetail,
  AdsResearchFilters,
  AdsResearchItem,
  AdsResearchMetric,
  AdsResearchPlatform,
  AdsResearchResponse,
  AdsResearchSource,
  AdsResearchWorkflowResult,
  CampaignLaunchPrep,
} from '@genfeedai/interfaces/integrations/ads-research.interface';
import { type AdPerformance, type CreativePattern } from '@genfeedai/prisma';
import { BadRequestException, Injectable } from '@nestjs/common';

interface DetailContext {
  source: Exclude<AdsResearchSource, 'all'>;
  id: string;
  platform?: AdsResearchPlatform;
  channel?: AdsChannel;
  credentialId?: string;
  adAccountId?: string;
  loginCustomerId?: string;
}

interface RemixWorkflowInput {
  userId: string;
  organizationId: string;
  brandId?: string;
  brandName?: string;
  industry?: string;
  objective?: string;
  source: Exclude<AdsResearchSource, 'all'>;
  adId: string;
  platform?: AdsResearchPlatform;
  channel?: AdsChannel;
  credentialId?: string;
  adAccountId?: string;
  loginCustomerId?: string;
}

interface LaunchPrepInput extends RemixWorkflowInput {
  campaignName?: string;
  createWorkflow?: boolean;
  dailyBudget?: number;
}

interface ConnectedItemParams {
  platform: AdsResearchPlatform;
  sourceId: string;
  name?: string;
  ad?: UnifiedAd;
  topInsights?: {
    spend: number;
    impressions: number;
    clicks: number;
    ctr: number;
    cpc: number;
    cpm: number;
    conversions?: number;
    revenue?: number;
    roas?: number;
    cpa?: number;
    dateStart: string;
    dateStop: string;
  };
  metricValue?: number;
  insightMetric?: string;
  credentialId: string;
  adAccountId: string;
  loginCustomerId?: string;
  channel?: AdsChannel;
}

@Injectable()
export class AdsResearchService {
  constructor(
    private readonly adPerformanceService: AdPerformanceService,
    private readonly creativePatternsService: CreativePatternsService,
    private readonly credentialsService: CredentialsService,
    private readonly adsGatewayService: AdsGatewayService,
    private readonly workflowsService: WorkflowsService,
  ) {}

  async listAds(
    organizationId: string,
    filters: AdsResearchFilters,
  ): Promise<AdsResearchResponse> {
    const normalized = this.normalizeFilters(filters);
    const publicAds =
      normalized.source === 'my_accounts'
        ? []
        : await this.getPublicAds(normalized);
    const connectedAds =
      normalized.source === 'public'
        ? []
        : await this.getConnectedAds(organizationId, normalized);

    return {
      connectedAds,
      filters: normalized,
      publicAds,
      summary: {
        connectedCount: connectedAds.length,
        publicCount: publicAds.length,
        reviewPolicy: 'All remixes and launch prep remain paused for review.',
        selectedPlatform: normalized.platform ?? 'all',
        selectedSource: normalized.source ?? 'all',
      },
    };
  }

  async getAdDetail(
    organizationId: string,
    params: DetailContext,
  ): Promise<AdsResearchDetail> {
    if (params.source === 'public') {
      const item = await this.getPublicAdDetail(params.id);
      if (!item) {
        throw new BadRequestException(`Public ad ${params.id} was not found`);
      }

      return item;
    }

    if (!params.platform || !params.credentialId || !params.adAccountId) {
      throw new BadRequestException(
        'platform, credentialId, and adAccountId are required for connected ad detail',
      );
    }

    const detail = await this.getConnectedAdDetail(organizationId, {
      adAccountId: params.adAccountId,
      adId: params.id,
      channel: params.channel,
      credentialId: params.credentialId,
      loginCustomerId: params.loginCustomerId,
      platform: params.platform,
    });

    if (!detail) {
      throw new BadRequestException(`Connected ad ${params.id} was not found`);
    }

    return detail;
  }

  async generateAdPack(
    organizationId: string,
    input: Omit<RemixWorkflowInput, 'organizationId' | 'userId'>,
  ): Promise<AdPack> {
    const ad = await this.getAdDetail(organizationId, {
      adAccountId: input.adAccountId,
      channel: input.channel,
      credentialId: input.credentialId,
      id: input.adId,
      loginCustomerId: input.loginCustomerId,
      platform: input.platform,
      source: input.source,
    });

    return this.buildAdPack({
      ad,
      brandName: input.brandName,
      channel: input.channel,
      industry: input.industry,
      objective: input.objective,
    });
  }

  async createRemixWorkflow(
    input: RemixWorkflowInput,
  ): Promise<AdsResearchWorkflowResult> {
    const ad = await this.getAdDetail(input.organizationId, {
      adAccountId: input.adAccountId,
      channel: input.channel,
      credentialId: input.credentialId,
      id: input.adId,
      loginCustomerId: input.loginCustomerId,
      platform: input.platform,
      source: input.source,
    });
    const adPack = this.buildAdPack({
      ad,
      brandName: input.brandName,
      channel: input.channel,
      industry: input.industry,
      objective: input.objective,
    });

    const workflow = await this.workflowsService.createWorkflow(
      input.userId,
      input.organizationId,
      {
        description:
          'Analyze a winning ad, adapt the angle to the selected brand, draft an ad pack, and keep launch prep paused for human review.',
        label: `${input.brandName || 'Brand'} ${this.toPlatformLabel(ad.platform)} Ad Remix`,
        metadata: {
          adPack,
          brandId: input.brandId,
          brandName: input.brandName,
          industry: input.industry,
          objective: input.objective || ad.campaignObjective || 'Conversions',
          reviewStatus: 'review_required',
          sourceAdId: ad.sourceId,
          sourceAdSource: ad.source,
          sourceChannel: ad.channel,
          sourcePlatform: ad.platform,
        },
        status: WorkflowStatus.DRAFT,
        templateId: 'ad-remix-review',
        trigger: WorkflowTrigger.SCHEDULED,
      },
    );

    return {
      adPack,
      reviewRequired: true,
      workflowDescription:
        'Draft workflow created from a winning ad. Review outputs before any launch action.',
      workflowId: workflow._id.toString(),
      workflowName: workflow.label,
    };
  }

  async prepareCampaignForReview(
    input: LaunchPrepInput,
  ): Promise<CampaignLaunchPrep> {
    const adPack = await this.generateAdPack(input.organizationId, {
      adAccountId: input.adAccountId,
      adId: input.adId,
      brandId: input.brandId,
      brandName: input.brandName,
      channel: input.channel,
      credentialId: input.credentialId,
      industry: input.industry,
      loginCustomerId: input.loginCustomerId,
      objective: input.objective,
      platform: input.platform,
      source: input.source,
    });

    const detail = await this.getAdDetail(input.organizationId, {
      adAccountId: input.adAccountId,
      channel: input.channel,
      credentialId: input.credentialId,
      id: input.adId,
      loginCustomerId: input.loginCustomerId,
      platform: input.platform,
      source: input.source,
    });

    let workflowId: string | undefined;
    let workflowName: string | undefined;

    if (input.createWorkflow) {
      const workflow = await this.createRemixWorkflow(input);
      workflowId = workflow.workflowId;
      workflowName = workflow.workflowName;
    }

    return {
      ad: {
        body: adPack.primaryText,
        callToAction: adPack.cta,
        headline: adPack.headlines[0],
        linkUrl: detail.landingPageUrl,
        name: `${input.brandName || 'Brand'} ${this.toPlatformLabel(detail.platform)} Ad`,
      },
      adAccountId: input.adAccountId,
      adPack,
      adSet: {
        name: `${input.brandName || 'Brand'} ${detail.channel.toUpperCase()} Audience`,
        optimizationGoal:
          input.objective || detail.campaignObjective || 'CONVERSIONS',
        targeting: {
          industry: input.industry || detail.industry || 'general',
          placements: adPack.campaignRecipe.placements,
          sourcePatternLabels:
            detail.patternSummary?.map((pattern) => pattern.label) ?? [],
        },
      },
      campaign: {
        dailyBudget: input.dailyBudget,
        name:
          input.campaignName ||
          `${input.brandName || 'Brand'} ${detail.channel === 'all' ? this.toPlatformLabel(detail.platform) : detail.channel} Campaign`,
        objective: input.objective || detail.campaignObjective || 'CONVERSIONS',
        status: 'PAUSED',
      },
      channel: detail.channel,
      credentialId: input.credentialId,
      loginCustomerId: input.loginCustomerId,
      notes: [
        'Campaign launch prep is paused and requires human approval.',
        'Review targeting, CTA, and landing page alignment before publish.',
        'Use the existing platform integration to push this draft live only after approval.',
      ],
      platform: detail.platform,
      publishMode: 'paused',
      reviewRequired: true,
      status: 'review_required',
      workflowId,
      workflowName,
    };
  }

  private async getPublicAds(
    filters: AdsResearchFilters,
  ): Promise<AdsResearchItem[]> {
    const items = await this.adPerformanceService.findTopPerformers({
      adPlatform: filters.platform,
      industry: filters.industry,
      limit: filters.limit,
      metric: this.mapMetric(filters.metric),
      scope: 'public',
    });

    return Promise.all(items.map((item) => this.mapPublicItem(item)));
  }

  private async getPublicAdDetail(
    id: string,
  ): Promise<AdsResearchDetail | null> {
    const item = await this.adPerformanceService.findById(id);
    if (!item) {
      return null;
    }

    const base = await this.mapPublicItem(item);
    return {
      ...base,
      creative: {
        body: item.bodyText,
        cta: item.ctaText,
        headline: item.headlineText,
        imageUrls: item.imageUrls,
        landingPageUrl: item.landingPageUrl,
        videoUrls: item.videoUrls,
      },
    };
  }

  private async getConnectedAds(
    organizationId: string,
    filters: AdsResearchFilters,
  ): Promise<AdsResearchItem[]> {
    if (!filters.platform || !filters.credentialId || !filters.adAccountId) {
      return [];
    }

    const context = await this.buildContext(organizationId, {
      adAccountId: filters.adAccountId,
      credentialId: filters.credentialId,
      loginCustomerId: filters.loginCustomerId,
      platform: filters.platform,
    });
    const adapter = this.adsGatewayService.getAdapter(filters.platform);
    const [ads, topPerformers] = await Promise.all([
      adapter.listAds(context),
      adapter.getTopPerformers(context, {
        datePreset: this.mapDatePreset(filters.timeframe),
        limit: filters.limit,
        metric: this.mapMetric(filters.metric),
      }),
    ]);

    const adMap = new Map(ads.map((ad) => [ad.id, ad]));
    return topPerformers.map((performer) =>
      this.mapConnectedItem({
        ad: adMap.get(performer.id),
        adAccountId: filters.adAccountId!,
        channel: filters.channel,
        credentialId: filters.credentialId!,
        insightMetric: performer.metric,
        loginCustomerId: filters.loginCustomerId,
        metricValue: performer.value,
        name: performer.name,
        platform: filters.platform as AdsResearchPlatform,
        sourceId: performer.id,
        topInsights: performer.insights,
      }),
    );
  }

  private async getConnectedAdDetail(
    organizationId: string,
    params: {
      platform: AdsResearchPlatform;
      credentialId: string;
      adAccountId: string;
      adId: string;
      channel?: AdsChannel;
      loginCustomerId?: string;
    },
  ): Promise<AdsResearchDetail | null> {
    const context = await this.buildContext(organizationId, {
      adAccountId: params.adAccountId,
      credentialId: params.credentialId,
      loginCustomerId: params.loginCustomerId,
      platform: params.platform,
    });
    const adapter = this.adsGatewayService.getAdapter(params.platform);
    const [ads, topPerformers] = await Promise.all([
      adapter.listAds(context),
      adapter.getTopPerformers(context, {
        limit: 25,
        metric: 'performanceScore',
      }),
    ]);

    const ad = ads.find((item) => item.id === params.adId);
    if (!ad) {
      return null;
    }

    const topMatch = topPerformers.find((item) => item.id === params.adId);
    const base = this.mapConnectedItem({
      ad,
      adAccountId: params.adAccountId,
      channel: params.channel,
      credentialId: params.credentialId,
      insightMetric: topMatch?.metric,
      loginCustomerId: params.loginCustomerId,
      metricValue: topMatch?.value,
      name: topMatch?.name || ad.name,
      platform: params.platform as AdsResearchPlatform,
      sourceId: params.adId,
      topInsights: topMatch?.insights,
    });

    return {
      ...base,
      creative: {
        body: ad.creative?.body,
        cta: ad.creative?.callToAction,
        headline: ad.creative?.title,
        imageUrls: ad.creative?.imageUrl ? [ad.creative.imageUrl] : [],
        landingPageUrl: ad.creative?.linkUrl,
        videoUrls: ad.creative?.videoId ? [ad.creative.videoId] : [],
      },
    };
  }

  private async mapPublicItem(item: AdPerformance): Promise<AdsResearchItem> {
    const platform = this.normalizePlatform(String(item.adPlatform || 'meta'));
    const patterns = await this.getPatternSummary({
      industry: item.industry as string | undefined,
      platform,
    });
    const imageUrls = Array.isArray(item.imageUrls)
      ? (item.imageUrls as string[])
      : [];
    const videoUrls = Array.isArray(item.videoUrls)
      ? (item.videoUrls as string[])
      : [];

    const itemWithId = item as AdPerformance & {
      _id?: string;
    };

    return {
      body: item.bodyText as string | undefined,
      campaignId: item.externalCampaignId as string | undefined,
      campaignName: item.campaignName as string | undefined,
      campaignObjective: item.campaignObjective as string | undefined,
      channel: 'all',
      cta: item.ctaText as string | undefined,
      explanation: this.buildExplanation({
        ctr: this.toNumber(item.ctr),
        industry: item.industry as string | undefined,
        patterns,
        platform,
        roas: this.toNumber(item.roas),
      }),
      headline: item.headlineText as string | undefined,
      id: String(
        itemWithId._id || item.externalAdId || item.externalCampaignId || '',
      ),
      imageUrls,
      industry: item.industry as string | undefined,
      landingPageUrl: item.landingPageUrl as string | undefined,
      metricLabel: 'Performance score',
      metrics: {
        clicks: this.toNumber(item.clicks),
        conversionRate: this.toNumber(item.conversionRate),
        conversions: this.toNumber(item.conversions),
        cpc: this.toNumber(item.cpc),
        cpm: this.toNumber(item.cpm),
        ctr: this.toNumber(item.ctr),
        impressions: this.toNumber(item.impressions),
        performanceScore: this.toNumber(item.performanceScore),
        revenue: this.toNumber(item.revenue),
        roas: this.toNumber(item.roas),
        spend: this.toNumber(item.spend),
      },
      metricValue: this.toNumber(item.performanceScore),
      patternSummary: patterns,
      platform,
      previewUrl: imageUrls[0] || videoUrls[0],
      source: 'public',
      sourceId: String(
        item.externalAdId || item.externalCampaignId || itemWithId._id || '',
      ),
      sourceLabel: 'Public niche winner',
      status: item.campaignStatus as string | undefined,
      title:
        (item.campaignName as string | undefined) ||
        (item.headlineText as string | undefined) ||
        'Top performing ad',
      videoUrls,
    };
  }

  private mapConnectedItem(params: ConnectedItemParams): AdsResearchItem {
    const creative = params.ad?.creative;
    const channel =
      params.platform === 'google' ? params.channel || 'search' : 'all';

    return {
      accountId: params.adAccountId,
      accountName: `Connected ${this.toPlatformLabel(params.platform)} account`,
      adAccountId: params.adAccountId,
      body: creative?.body,
      channel,
      credentialId: params.credentialId,
      cta: creative?.callToAction,
      explanation: `This ad is performing well in your connected ${this.toPlatformLabel(
        params.platform,
      )} account. Keep the core angle, tighten the promise, and adapt the proof for your brand before launch.`,
      headline: creative?.title,
      id: `connected:${params.platform}:${params.sourceId}`,
      imageUrls: creative?.imageUrl ? [creative.imageUrl] : [],
      landingPageUrl: creative?.linkUrl,
      loginCustomerId: params.loginCustomerId,
      metricLabel: params.insightMetric || 'performance',
      metrics: {
        clicks: params.topInsights?.clicks,
        conversions: params.topInsights?.conversions,
        cpc: params.topInsights?.cpc,
        cpm: params.topInsights?.cpm,
        ctr: params.topInsights?.ctr,
        impressions: params.topInsights?.impressions,
        performanceScore: params.metricValue,
        revenue: params.topInsights?.revenue,
        roas: params.topInsights?.roas,
        spend: params.topInsights?.spend,
      },
      metricValue: params.metricValue,
      patternSummary: [],
      platform: params.platform,
      previewUrl: creative?.imageUrl || creative?.videoId,
      source: 'my_accounts',
      sourceId: params.sourceId,
      sourceLabel: 'Connected account',
      status: params.ad?.status,
      title: params.name || params.ad?.name || 'Connected ad',
      videoUrls: params.ad?.creative?.videoId
        ? [params.ad.creative.videoId]
        : [],
    };
  }

  private async getPatternSummary(params: {
    platform: AdsResearchPlatform;
    industry?: string;
  }) {
    const patterns = await this.creativePatternsService.findAll({
      platform: this.toPatternPlatform(params.platform),
      scope: 'public',
    });

    return patterns
      .filter((pattern) =>
        params.industry
          ? pattern.industry?.toLowerCase() === params.industry.toLowerCase()
          : true,
      )
      .slice(0, 3)
      .map((pattern: CreativePattern & { _id?: string }) => ({
        examples:
          pattern.examples?.slice(0, 2).map((example) => example.text) || [],
        id: String(pattern._id || ''),
        label: pattern.label,
        score: pattern.avgPerformanceScore,
        summary:
          pattern.description ||
          `High-performing ${pattern.patternType} pattern for ${params.platform}.`,
      }));
  }

  private buildAdPack(params: {
    ad: AdsResearchDetail;
    brandName?: string;
    industry?: string;
    objective?: string;
    channel?: AdsChannel;
  }): AdPack {
    const brandName = params.brandName || 'your brand';
    const objective =
      params.objective || params.ad.campaignObjective || 'Conversions';
    const channel = params.channel || params.ad.channel || 'all';
    const sourceHeadline = params.ad.headline?.trim() || 'Winning angle';
    const sourceBody = params.ad.body?.trim() || 'Strong proof-based ad copy';
    const sourceCta = params.ad.cta?.trim() || 'Learn more';
    const niche = params.industry || params.ad.industry || 'your niche';

    return {
      assetCreativeBrief: `Build a ${this.toPlatformLabel(
        params.ad.platform,
      )} creative for ${brandName} in ${niche}. Keep the winning angle from "${sourceHeadline}", make the promise clearer, add brand-specific proof, and leave space for a direct CTA.`,
      campaignRecipe: {
        budgetStrategy:
          params.ad.platform === 'google'
            ? 'Start with a paused daily budget and validate search intent before scale.'
            : 'Start with a paused daily budget and test 2-3 placement clusters before scale.',
        channel,
        objective,
        placements:
          params.ad.platform === 'google'
            ? channel === 'youtube'
              ? ['YouTube In-Feed', 'YouTube Shorts']
              : channel === 'display'
                ? ['Display Network']
                : ['Google Search']
            : ['Facebook Feed', 'Instagram Feed', 'Stories'],
        platform: params.ad.platform,
        reviewStatus: 'review_required',
      },
      cta: sourceCta,
      headlines: [
        `${brandName}: ${sourceHeadline}`,
        `Why ${niche} buyers switch to ${brandName}`,
        `${brandName} without the usual ${niche} friction`,
      ],
      primaryText: `${sourceBody}\n\nAdapt this around ${brandName}, make the offer concrete for ${niche}, and tie every line back to the ${objective.toLowerCase()} goal.`,
      targetingNotes: `Target ${niche} audiences already showing intent. Mirror the source angle, but replace broad claims with ${brandName}-specific proof, objections, and outcome language.`,
    };
  }

  private buildExplanation(params: {
    platform: AdsResearchPlatform;
    industry?: string;
    ctr?: number;
    roas?: number;
    patterns: Array<{ label: string }>;
  }): string {
    const parts = [
      `This ${this.toPlatformLabel(params.platform)} ad is outperforming peers`,
    ];

    if (params.industry) {
      parts.push(`in the ${params.industry} niche`);
    }

    if (typeof params.ctr === 'number' && params.ctr > 0) {
      parts.push(`with a ${params.ctr.toFixed(2)}% CTR signal`);
    }

    if (typeof params.roas === 'number' && params.roas > 0) {
      parts.push(`and ${params.roas.toFixed(2)}x ROAS`);
    }

    if (params.patterns.length > 0) {
      parts.push(
        `. The strongest reusable patterns here are ${params.patterns
          .map((pattern) => pattern.label)
          .join(', ')}`,
      );
    }

    return `${parts.join(' ')}.`;
  }

  private normalizeFilters(filters: AdsResearchFilters): AdsResearchFilters {
    return {
      ...filters,
      channel: filters.channel || 'all',
      limit: filters.limit ? Math.min(filters.limit, 24) : 12,
      metric: filters.metric || 'performanceScore',
      source: filters.source || 'all',
      timeframe: filters.timeframe || 'last_30_days',
    };
  }

  private normalizePlatform(platform: string): AdsResearchPlatform {
    return platform === 'google_ads'
      ? 'google'
      : (platform as AdsResearchPlatform);
  }

  private toPatternPlatform(platform: AdsResearchPlatform): string {
    return platform === 'meta' ? 'facebook' : 'google_ads';
  }

  private toPlatformLabel(platform: AdsResearchPlatform | AdsPlatform): string {
    return platform === 'meta' ? 'Meta Ads' : 'Google Ads';
  }

  private mapMetric(metric?: AdsResearchMetric): string {
    if (!metric || metric === 'spendEfficiency') {
      return 'performanceScore';
    }

    return metric;
  }

  private mapDatePreset(timeframe?: AdsResearchFilters['timeframe']): string {
    switch (timeframe) {
      case 'last_7_days':
        return 'last_7d';
      case 'last_90_days':
        return 'last_90d';
      case 'all_time':
        return 'maximum';
      case 'last_30_days':
      default:
        return 'last_30d';
    }
  }

  private async buildContext(
    organizationId: string,
    params: {
      platform: AdsResearchPlatform;
      credentialId: string;
      adAccountId: string;
      loginCustomerId?: string;
    },
  ): Promise<AdsAdapterContext> {
    if (!/^[0-9a-f]{24}$/i.test(params.credentialId)) {
      throw new BadRequestException('credentialId is invalid');
    }

    const credential = await this.credentialsService.findOne({
      _id: params.credentialId,
      isDeleted: false,
      organization: organizationId,
    });

    if (!credential?.accessToken) {
      throw new BadRequestException(
        `Credential ${params.credentialId} was not found or is disconnected`,
      );
    }

    return {
      accessToken: credential.accessToken,
      adAccountId: params.adAccountId,
      credentialId: params.credentialId,
      loginCustomerId: params.loginCustomerId,
      organizationId,
    };
  }

  private toNumber(value: unknown): number | undefined {
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : undefined;
    }

    if (typeof value === 'string' && value.trim().length > 0) {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : undefined;
    }

    return undefined;
  }
}
