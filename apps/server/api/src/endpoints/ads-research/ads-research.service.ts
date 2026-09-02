import type { AdPerformanceDocument } from '@api/collections/ad-performance/schemas/ad-performance.schema';
import { AdPerformanceService } from '@api/collections/ad-performance/services/ad-performance.service';
import { CreativePatternsService } from '@api/collections/creative-patterns/creative-patterns.service';
import type { CreativePatternDocument } from '@api/collections/creative-patterns/schemas/creative-pattern.schema';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { WorkflowsService } from '@api/collections/workflows/services/workflows.service';
import { isEntityId } from '@api/helpers/validation/entity-id.validator';
import { mapAdsCredentialPlatform } from '@api/services/ads-gateway/ads-credential-platform.util';
import { AdsGatewayService } from '@api/services/ads-gateway/ads-gateway.service';
import { HarnessGenerationService } from '@api/services/harness/harness-generation.service';
import {
  Platform,
  toPrismaCredentialPlatform,
  WorkflowStatus,
  WorkflowTrigger,
} from '@genfeedai/contracts';
import type {
  AdsAdapterContext,
  AdsPlatform,
  UnifiedAd,
} from '@genfeedai/contracts/interfaces';
import type {
  AdPack,
  AdsChannel,
  AdsResearchDetail,
  AdsResearchFilters,
  AdsResearchItem,
  AdsResearchLongevity,
  AdsResearchMetric,
  AdsResearchPlatform,
  AdsResearchResponse,
  AdsResearchSource,
  AdsResearchWorkflowResult,
  CampaignLaunchPrep,
} from '@genfeedai/contracts/interfaces/integrations/ads-research.interface';
import type { PaidCreativeProvider } from '@genfeedai/integrations/ads';
import {
  isPaidCreativeResearchSource,
  resolvePaidCreativeLongevity,
  resolvePaidCreativeSourceLabel,
  resolvePaidCreativeUsagePolicy,
} from '@genfeedai/integrations/ads';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import { BadRequestException, Injectable, Optional } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';

interface DetailContext {
  source: Exclude<AdsResearchSource, 'all'>;
  id: string;
  brandId?: string;
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
    @Optional()
    private readonly harnessGenerationService?: HarnessGenerationService,
    @Optional()
    private readonly moduleRef?: ModuleRef,
  ) {}

  async listAds(
    organizationId: string,
    filters: AdsResearchFilters,
  ): Promise<AdsResearchResponse> {
    const normalized = this.normalizeFilters(filters);
    const publicAds =
      normalized.source === 'my_accounts'
        ? []
        : await this.getPublicAds(organizationId, normalized);
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
      const item = await this.getPublicAdDetail(
        organizationId,
        params.id,
        params.brandId,
      );
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
      brandId: input.brandId,
      channel: input.channel,
      credentialId: input.credentialId,
      id: input.adId,
      loginCustomerId: input.loginCustomerId,
      platform: input.platform,
      source: input.source,
    });

    this.assertRemixAllowed(ad);

    const harnessNotes = await this.resolveAdHarnessNotes(
      organizationId,
      input.brandId,
      input.platform ?? ad.platform,
    );

    return this.buildAdPack({
      ad,
      brandName: input.brandName,
      channel: input.channel,
      harnessNotes,
      industry: input.industry,
      objective: input.objective,
    });
  }

  async createRemixWorkflow(
    input: RemixWorkflowInput,
  ): Promise<AdsResearchWorkflowResult> {
    const ad = await this.getAdDetail(input.organizationId, {
      adAccountId: input.adAccountId,
      brandId: input.brandId,
      channel: input.channel,
      credentialId: input.credentialId,
      id: input.adId,
      loginCustomerId: input.loginCustomerId,
      platform: input.platform,
      source: input.source,
    });
    this.assertRemixAllowed(ad);
    const harnessNotes = await this.resolveAdHarnessNotes(
      input.organizationId,
      input.brandId,
      input.platform ?? ad.platform,
    );
    const adPack = this.buildAdPack({
      ad,
      brandName: input.brandName,
      channel: input.channel,
      harnessNotes,
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
      workflowId: workflow.id.toString(),
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
      brandId: input.brandId,
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
    organizationId: string,
    filters: AdsResearchFilters,
  ): Promise<AdsResearchItem[]> {
    const items = await this.adPerformanceService.findTopPerformers({
      adPlatform: filters.platform,
      brandId: filters.brandId,
      industry: filters.industry,
      limit: filters.limit,
      metric: this.mapMetric(filters.metric),
      organizationId,
      scope: 'public',
    });

    return Promise.all(
      items.map((item) => this.mapPublicItem(organizationId, item)),
    );
  }

  private async getPublicAdDetail(
    organizationId: string,
    id: string,
    brandId?: string,
  ): Promise<AdsResearchDetail | null> {
    const item = await this.adPerformanceService.findPublicById(
      id,
      organizationId,
      brandId,
    );
    if (!item) {
      return null;
    }

    const base = await this.mapPublicItem(organizationId, item);
    if (base.usagePolicy === 'disclosure_only') {
      return {
        ...base,
        creative: {
          imageUrls: [],
          videoUrls: [],
        },
      };
    }

    return {
      ...base,
      creative: {
        body: item.bodyText,
        cta: item.ctaText ?? undefined,
        headline: item.headlineText ?? undefined,
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

    const adAccountId = filters.adAccountId;
    const credentialId = filters.credentialId;
    const context = await this.buildContext(organizationId, {
      adAccountId,
      credentialId,
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
        adAccountId,
        channel: filters.channel,
        credentialId,
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
        videoUrls: [],
      },
    };
  }

  private async mapPublicItem(
    organizationId: string,
    item: AdPerformanceDocument,
  ): Promise<AdsResearchItem> {
    const platform = this.normalizePlatform(String(item.adPlatform || 'meta'));
    const researchSource = item.researchSource as string | undefined;

    if (isPaidCreativeResearchSource(researchSource)) {
      return this.mapResearchItem({
        item,
        organizationId,
        platform,
        provider: researchSource,
      });
    }

    const patterns = await this.getPatternSummary({
      industry: item.industry as string | undefined,
      organizationId,
      platform,
    });
    const imageUrls = Array.isArray(item.imageUrls)
      ? (item.imageUrls as string[])
      : [];
    const videoUrls = Array.isArray(item.videoUrls)
      ? (item.videoUrls as string[])
      : [];

    return {
      accountId: item.advertiserId as string | undefined,
      accountName: item.advertiserName as string | undefined,
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
      firstSeenAt: item.presentationStartDate as string | undefined,
      id: String(item.id || item.externalAdId || item.externalCampaignId || ''),
      imageUrls,
      industry: item.industry as string | undefined,
      landingPageUrl: item.landingPageUrl as string | undefined,
      lastSeenAt: item.presentationEndDate as string | undefined,
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
        item.externalAdId || item.externalCampaignId || item.id || '',
      ),
      sourceLabel: 'Public niche winner',
      status: item.campaignStatus as string | undefined,
      title:
        (item.campaignName as string | undefined) ||
        (item.headlineText as string | undefined) ||
        'Top performing ad',
      usagePolicy: 'remix_allowed',
      videoUrls,
    };
  }

  /**
   * Turn the run dates an archive published into a persistence score. This is
   * the only performance-shaped number a competitor row ever carries: archives
   * disclose how long an advertiser kept paying for a creative, never how it
   * performed, and a long-lived ad is the honest proxy for a winning one.
   */
  private resolveItemLongevity(
    item: AdPerformanceDocument,
  ): AdsResearchLongevity | undefined {
    return (
      resolvePaidCreativeLongevity(
        {
          isHalted: item.isHalted === true,
          presentationEndDate: item.presentationEndDate as string | undefined,
          presentationStartDate: item.presentationStartDate as
            | string
            | undefined,
        },
        new Date(),
      ) ?? undefined
    );
  }

  /**
   * Present a tenant-owned competitor snapshot from a transparency archive.
   *
   * Archives publish creative, not delivery: none of them disclose spend,
   * clicks, or conversions, so `metrics` stays empty rather than reporting a
   * confident zero for numbers nobody published. The only figure some archives
   * do disclose is reach, and it stays `undefined` when they did not.
   *
   * `usagePolicy` comes from the archive, not from the platform: the X DSA
   * repository exists for regulatory disclosure, so its records are shown
   * without creative and cannot be remixed, while every other archive
   * publishes creative as public marketing inspiration.
   */
  private async mapResearchItem(params: {
    item: AdPerformanceDocument;
    organizationId: string;
    platform: AdsResearchPlatform;
    provider: PaidCreativeProvider;
  }): Promise<AdsResearchItem> {
    const { item, organizationId, platform, provider } = params;
    const sourceLabel = resolvePaidCreativeSourceLabel(provider);
    const usagePolicy = resolvePaidCreativeUsagePolicy(provider);
    const isRemixAllowed = usagePolicy === 'remix_allowed';
    const advertiserLabel =
      (item.advertiserName as string | undefined) ||
      (item.advertiserHandle as string | undefined) ||
      'Advertiser';
    const imageUrls =
      isRemixAllowed && Array.isArray(item.imageUrls)
        ? (item.imageUrls as string[])
        : [];
    const videoUrls =
      isRemixAllowed && Array.isArray(item.videoUrls)
        ? (item.videoUrls as string[])
        : [];
    const patternSummary = isRemixAllowed
      ? await this.getPatternSummary({
          industry: item.industry as string | undefined,
          organizationId,
          platform,
        })
      : [];
    const longevity = this.resolveItemLongevity(item);
    const longevityNote = longevity
      ? ` It has been running for ${longevity.daysLive} day${
          longevity.daysLive === 1 ? '' : 's'
        } and is ${longevity.isStillRunning ? 'still live' : 'no longer live'}.`
      : '';

    return {
      accountId: item.advertiserId as string | undefined,
      accountName: advertiserLabel,
      body: isRemixAllowed ? (item.bodyText as string | undefined) : undefined,
      channel: 'all',
      cta: isRemixAllowed ? (item.ctaText as string | undefined) : undefined,
      explanation: isRemixAllowed
        ? `${sourceLabel} creative currently served by ${advertiserLabel}. The archive publishes the creative only, so delivery and spend metrics are unavailable.${longevityNote}`
        : `Tenant-scoped ${sourceLabel}. Performance metrics are unavailable, and commercial remix use is disabled pending approval.${longevityNote}`,
      headline: isRemixAllowed
        ? (item.headlineText as string | undefined)
        : undefined,
      firstSeenAt: item.presentationStartDate as string | undefined,
      id: String(item.id || item.externalAdId || ''),
      imageUrls,
      industry: isRemixAllowed
        ? (item.industry as string | undefined)
        : undefined,
      landingPageUrl: isRemixAllowed
        ? (item.landingPageUrl as string | undefined)
        : undefined,
      lastSeenAt: item.presentationEndDate as string | undefined,
      longevity,
      metricLabel: 'Estimated reach',
      metricValue: this.toNumber(item.estimatedReach),
      metrics: {},
      patternSummary,
      platform,
      previewUrl: imageUrls[0] || videoUrls[0],
      source: 'public',
      sourceId: String(item.externalAdId || item.id || ''),
      sourceLabel,
      status: item.campaignStatus as string | undefined,
      title: isRemixAllowed
        ? (item.campaignName as string | undefined) ||
          (item.headlineText as string | undefined) ||
          `${advertiserLabel} ad`
        : `${advertiserLabel} disclosure`,
      usagePolicy,
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
      previewUrl: creative?.imageUrl,
      source: 'my_accounts',
      sourceId: params.sourceId,
      sourceLabel: 'Connected account',
      status: params.ad?.status,
      title: params.name || params.ad?.name || 'Connected ad',
      videoUrls: [],
    };
  }

  private async getPatternSummary(params: {
    organizationId: string;
    platform: AdsResearchPlatform;
    industry?: string;
  }) {
    const patterns = await this.creativePatternsService.findAll({
      organizationId: params.organizationId,
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
      .map((pattern: CreativePatternDocument) => ({
        examples:
          pattern.examples
            ?.slice(0, 2)
            .map((example) => example.text)
            .filter(
              (example): example is string => typeof example === 'string',
            ) || [],
        id: String(pattern.id || ''),
        label: pattern.label ?? 'Untitled pattern',
        score: pattern.avgPerformanceScore ?? 0,
        summary:
          pattern.description ||
          `High-performing ${pattern.patternType} pattern for ${params.platform}.`,
      }));
  }

  private async resolveAdHarnessNotes(
    organizationId: string,
    brandId: string | undefined,
    platform: string | undefined,
  ): Promise<string | undefined> {
    const harnessGenerationService = this.resolveHarnessGenerationService();
    if (!brandId || !harnessGenerationService) {
      return undefined;
    }
    const brief = await harnessGenerationService.resolveBrief({
      brandId,
      contentType: 'ad-creative',
      objective: 'conversion',
      organizationId,
      platform,
    });
    const formatted = harnessGenerationService.formatBrief(brief);
    return formatted || undefined;
  }

  private assertRemixAllowed(ad: AdsResearchDetail): void {
    if (ad.usagePolicy === 'disclosure_only') {
      throw new BadRequestException(
        `${ad.sourceLabel || 'These'} records are disclosure-only and cannot be remixed while commercial-use approval is unavailable`,
      );
    }
  }

  private resolveHarnessGenerationService():
    | HarnessGenerationService
    | undefined {
    if (this.harnessGenerationService) {
      return this.harnessGenerationService;
    }
    try {
      return this.moduleRef?.get(HarnessGenerationService, { strict: false });
    } catch {
      return undefined;
    }
  }

  private buildAdPack(params: {
    ad: AdsResearchDetail;
    brandName?: string;
    harnessNotes?: string;
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
    const harnessSuffix = params.harnessNotes
      ? `\n\nBRAND HARNESS:\n${params.harnessNotes}`
      : '';

    return {
      assetCreativeBrief: `Build a ${this.toPlatformLabel(
        params.ad.platform,
      )} creative for ${brandName} in ${niche}. Keep the winning angle from "${sourceHeadline}", make the promise clearer, add brand-specific proof, and leave space for a direct CTA.${harnessSuffix}`,
      campaignRecipe: {
        budgetStrategy:
          params.ad.platform === 'google'
            ? 'Start with a paused daily budget and validate search intent before scale.'
            : 'Start with a paused daily budget and test 2-3 placement clusters before scale.',
        channel,
        objective,
        placements:
          params.ad.platform === 'google'
            ? channel === Platform.YOUTUBE
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
      primaryText: `${sourceBody}\n\nAdapt this around ${brandName}, make the offer concrete for ${niche}, and tie every line back to the ${objective.toLowerCase()} goal.${harnessSuffix}`,
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
    const value = platform.trim().toLowerCase();
    // `google-ads` is the normalized ad-platform id transparency-archive
    // snapshots are stored with; `google_ads` is the connected-account spelling.
    if (
      value === 'google_ads' ||
      value === 'google-ads' ||
      value === 'google'
    ) {
      return 'google';
    }
    if (value === 'meta_ads' || value === 'facebook' || value === 'meta') {
      return 'meta';
    }
    if (value === 'tiktok_ads' || value === 'tiktok') {
      return 'tiktok';
    }
    if (value === 'x_ads' || value === 'x' || value === 'twitter') {
      return 'x';
    }
    return platform as AdsResearchPlatform;
  }

  private toPatternPlatform(platform: AdsResearchPlatform): string {
    if (platform === 'meta') {
      return 'facebook';
    }
    if (platform === 'tiktok') {
      return 'tiktok';
    }
    if (platform === 'x') {
      return 'x_ads';
    }
    return 'google_ads';
  }

  private toPlatformLabel(platform: AdsResearchPlatform | AdsPlatform): string {
    if (platform === 'meta') {
      return 'Meta Ads';
    }
    if (platform === 'tiktok') {
      return 'TikTok Ads';
    }
    if (platform === 'x') {
      return 'X Ads';
    }
    return 'Google Ads';
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
    if (!isEntityId(params.credentialId)) {
      throw new BadRequestException('credentialId is invalid');
    }

    const credential = await this.credentialsService.findOne({
      id: params.credentialId,
      isConnected: true,
      isDeleted: false,
      organizationId,
      platform: toPrismaCredentialPlatform(
        mapAdsCredentialPlatform(params.platform),
      ),
    });

    if (!credential?.accessToken) {
      throw new BadRequestException(
        `Credential ${params.credentialId} was not found or is disconnected`,
      );
    }

    return {
      accessToken: EncryptionUtil.decrypt(credential.accessToken),
      accessTokenSecret: credential.accessTokenSecret
        ? EncryptionUtil.decrypt(credential.accessTokenSecret)
        : undefined,
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
