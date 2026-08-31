import { APP_ROUTES } from '@genfeedai/constants';
import type { AgentToolResult } from '@genfeedai/interfaces';
import type {
  AdsChannel,
  AdsResearchFilters,
  AdsResearchPlatform,
  AdsResearchSource,
} from '@genfeedai/interfaces/integrations/ads-research.interface';
import { Injectable, Optional } from '@nestjs/common';
import { BrandsService } from '@server/collections/brands/services/brands.service';
import { AdsResearchService } from '@server/endpoints/ads-research/ads-research.service';
import type { ToolExecutionContext } from '@server/services/agent-orchestrator/tools/agent-tool-executor.service';
import {
  readAdsChannel,
  readAdsMetric,
  readAdsPlatform,
  readAdsSource,
  readAdsTimeframe,
  readOptionalNumber,
  readOptionalString,
} from '@server/services/agent-orchestrator/tools/agent-tool-parameter-readers';

/**
 * Discovery pages that exist per ads platform. Research covers every
 * `AdsResearchPlatform`, but only platforms with their own Discovery route get a
 * deep link — anything else falls back to the hub rather than a dead CTA.
 */
const PLATFORM_ADS_HREFS: Partial<Record<AdsResearchPlatform, string>> = {
  google: '/discovery/ads/google',
  meta: '/discovery/ads/meta',
};

const ADS_HUB_HREF = '/discovery/ads';

function adsPlatformHref(platform: AdsResearchPlatform | 'all'): string {
  return platform === 'all'
    ? ADS_HUB_HREF
    : (PLATFORM_ADS_HREFS[platform] ?? ADS_HUB_HREF);
}

/**
 * Ads research hub tools (`list_ads_research`, `get_ad_research_detail`,
 * `create_ad_remix_workflow`, `generate_ad_pack`, `prepare_ad_launch_review`).
 * Extracted from AgentToolExecutorService per #519.
 */
@Injectable()
export class AgentAdsResearchToolHandler {
  constructor(
    @Optional()
    private readonly adsResearchService: AdsResearchService | undefined,
    private readonly brandsService: BrandsService,
  ) {}

  async listAdsResearch(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    if (!this.adsResearchService) {
      return {
        creditsUsed: 0,
        error: 'Ads research service is not available.',
        success: false,
      };
    }

    const brandContext = await this.resolveAdsBrandContext(params, ctx);
    const filters: AdsResearchFilters = {
      adAccountId: readOptionalString(params.adAccountId),
      brandId: brandContext.brandId,
      brandName: brandContext.brandName,
      channel: readAdsChannel(params.channel),
      credentialId: readOptionalString(params.credentialId),
      industry: readOptionalString(params.industry) ?? brandContext.industry,
      limit: readOptionalNumber(params.limit),
      loginCustomerId: readOptionalString(params.loginCustomerId),
      metric: readAdsMetric(params.metric),
      platform: readAdsPlatform(params.platform),
      source: readAdsSource(params.source) ?? 'all',
      timeframe: readAdsTimeframe(params.timeframe),
    };

    const result = await this.adsResearchService.listAds(
      ctx.organizationId,
      filters,
    );
    const surfacedItems = [...result.publicAds, ...result.connectedAds].slice(
      0,
      6,
    );
    const platformHref = adsPlatformHref(result.summary.selectedPlatform);

    return {
      creditsUsed: 0,
      data: {
        connectedAds: result.connectedAds,
        filters: result.filters,
        publicAds: result.publicAds,
        reviewPolicy: result.summary.reviewPolicy,
      },
      nextActions: [
        {
          ctas: [
            { href: platformHref, label: 'Open ads hub' },
            { href: '/discovery/ads', label: 'Open all ads' },
          ],
          description: `Found ${result.summary.publicCount} public winners and ${result.summary.connectedCount} connected-account ads. Public winners stay first, and every workflow or launch prep remains paused for review.`,
          id: `ads-search-results-${Date.now()}`,
          items: surfacedItems.map((item) => ({
            id: item.id,
            platform: item.platform,
            previewUrl: item.previewUrl,
            title: item.title,
            type: item.source,
          })),
          metrics: {
            items: [
              { label: 'Public ads', value: result.summary.publicCount },
              {
                label: 'Connected ads',
                value: result.summary.connectedCount,
              },
            ],
          },
          title: 'Ads search results',
          type: 'ads_search_results_card',
        },
      ],
      success: true,
    };
  }

  async getAdResearchDetail(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    if (!this.adsResearchService) {
      return {
        creditsUsed: 0,
        error: 'Ads research service is not available.',
        success: false,
      };
    }

    const source = readAdsSource(params.source);
    const adId = readOptionalString(params.adId);

    if (!source || source === 'all' || !adId) {
      return {
        creditsUsed: 0,
        error: 'adId and source are required to inspect an ad.',
        success: false,
      };
    }

    const brandContext = await this.resolveAdsBrandContext(params, ctx);

    const detail = await this.adsResearchService.getAdDetail(
      ctx.organizationId,
      {
        adAccountId: readOptionalString(params.adAccountId),
        brandId: brandContext.brandId,
        channel: readAdsChannel(params.channel),
        credentialId: readOptionalString(params.credentialId),
        id: adId,
        loginCustomerId: readOptionalString(params.loginCustomerId),
        platform: readAdsPlatform(params.platform),
        source,
      },
    );

    return {
      creditsUsed: 0,
      data: {
        detail,
      },
      nextActions: [
        {
          ctas: [
            {
              href: adsPlatformHref(detail.platform),
              label: 'Open platform ads',
            },
            { href: '/discovery/ads', label: 'Open ads hub' },
          ],
          data: {
            campaignName: detail.campaignName,
            channel: detail.channel,
            explanation: detail.explanation,
            headline:
              detail.creative.headline || detail.headline || detail.title,
            platform: detail.platform,
            source: detail.source,
          },
          description:
            detail.explanation ||
            'Review the creative, metrics, and reusable pattern before remixing it.',
          id: `ad-detail-summary-${detail.source}-${detail.sourceId}`,
          title: 'Ad detail summary',
          type: 'ad_detail_summary_card',
        },
      ],
      success: true,
    };
  }

  async createAdRemixWorkflow(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    if (!this.adsResearchService) {
      return {
        creditsUsed: 0,
        error: 'Ads research service is not available.',
        success: false,
      };
    }

    const baseInput = await this.buildAdsWorkflowInput(params, ctx);
    if ('error' in baseInput) {
      return {
        creditsUsed: 0,
        error: baseInput.error,
        success: false,
      };
    }

    const workflow =
      await this.adsResearchService.createRemixWorkflow(baseInput);

    return {
      creditsUsed: 0,
      data: {
        adPack: workflow.adPack,
        reviewRequired: workflow.reviewRequired,
        workflowId: workflow.workflowId,
        workflowName: workflow.workflowName,
      },
      nextActions: [
        {
          ctas: [
            {
              href: `${APP_ROUTES.AUTOMATION.WORKFLOWS}/${workflow.workflowId}`,
              label: 'Open workflow',
            },
            {
              href: APP_ROUTES.AUTOMATION.WORKFLOWS,
              label: 'Open workflows',
            },
          ],
          description:
            workflow.workflowDescription ||
            'Ad remix workflow created. Review the ad pack and launch prep before publishing anything.',
          id: `workflow-created-${workflow.workflowId}`,
          title: 'Ad remix workflow created',
          type: 'workflow_created_card',
          workflowDescription: workflow.workflowDescription,
          workflowId: workflow.workflowId,
          workflowName: workflow.workflowName,
        },
      ],
      success: true,
    };
  }

  async generateAdPack(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    if (!this.adsResearchService) {
      return {
        creditsUsed: 0,
        error: 'Ads research service is not available.',
        success: false,
      };
    }

    const baseInput = await this.buildAdsWorkflowInput(params, ctx);
    if ('error' in baseInput) {
      return {
        creditsUsed: 0,
        error: baseInput.error,
        success: false,
      };
    }

    const adPack = await this.adsResearchService.generateAdPack(
      ctx.organizationId,
      baseInput,
    );

    return {
      creditsUsed: 0,
      data: {
        adPack,
      },
      nextActions: [
        {
          ctas: [{ href: '/discovery/ads', label: 'Open ads hub' }],
          data: {
            explanation: adPack.assetCreativeBrief,
            headline: adPack.headlines[0],
          },
          description:
            'Brand-specific ad pack drafted from the source winner. Review the CTA, targeting notes, and creative brief before launch prep.',
          id: `ad-pack-summary-${Date.now()}`,
          title: 'Ad pack drafted',
          type: 'ad_detail_summary_card',
        },
      ],
      success: true,
    };
  }

  async prepareAdLaunchReview(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    if (!this.adsResearchService) {
      return {
        creditsUsed: 0,
        error: 'Ads research service is not available.',
        success: false,
      };
    }

    const baseInput = await this.buildAdsWorkflowInput(params, ctx);
    if ('error' in baseInput) {
      return {
        creditsUsed: 0,
        error: baseInput.error,
        success: false,
      };
    }

    const launchPrep = await this.adsResearchService.prepareCampaignForReview({
      ...baseInput,
      campaignName: readOptionalString(params.campaignName),
      createWorkflow: params.createWorkflow === true,
      dailyBudget: readOptionalNumber(params.dailyBudget),
    });

    return {
      creditsUsed: 0,
      data: {
        launchPrep,
      },
      nextActions: [
        {
          ctas: [
            ...(launchPrep.workflowId
              ? [
                  {
                    href: `${APP_ROUTES.AUTOMATION.WORKFLOWS}/${launchPrep.workflowId}`,
                    label: 'Open workflow',
                  },
                ]
              : []),
            { href: '/discovery/ads', label: 'Open ads hub' },
          ],
          data: {
            channel: launchPrep.channel,
            platform: launchPrep.platform,
            publishMode: launchPrep.publishMode,
            status: launchPrep.status,
            workflowId: launchPrep.workflowId,
          },
          description:
            'Paused launch prep created. Human review is required before anything goes live.',
          id: `campaign-launch-prep-${Date.now()}`,
          title: 'Campaign launch prep',
          type: 'campaign_launch_prep_card',
        },
      ],
      requiresConfirmation: true,
      success: true,
    };
  }

  private async resolveAdsBrandContext(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<{
    brandId?: string;
    brandName?: string;
    industry?: string;
  }> {
    const explicitBrandId = readOptionalString(params.brandId);
    const fallbackBrandId = ctx.brandId;
    const brandLookupId = explicitBrandId ?? fallbackBrandId;

    if (!brandLookupId) {
      return {};
    }

    const brand = await this.resolveWorkflowBrand(
      { brandId: brandLookupId },
      ctx,
    );

    if (!brand) {
      return {
        brandId: brandLookupId,
      };
    }

    const brandRecord = brand as Record<string, unknown>;

    return {
      brandId: String(brandRecord.id ?? brandLookupId),
      brandName:
        readOptionalString(brandRecord.name) ??
        readOptionalString(brandRecord.label),
      industry:
        readOptionalString(brandRecord.industry) ??
        readOptionalString(brandRecord.niche) ??
        readOptionalString(brandRecord.category),
    };
  }

  private async buildAdsWorkflowInput(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<
    | {
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
    | { error: string }
  > {
    const source = readAdsSource(params.source);
    const adId = readOptionalString(params.adId);

    if (!source || source === 'all' || !adId) {
      return { error: 'adId and source are required for ads remix actions.' };
    }

    const brandContext = await this.resolveAdsBrandContext(params, ctx);

    return {
      adAccountId: readOptionalString(params.adAccountId),
      adId,
      brandId: brandContext.brandId,
      brandName: brandContext.brandName,
      channel: readAdsChannel(params.channel),
      credentialId: readOptionalString(params.credentialId),
      industry: readOptionalString(params.industry) ?? brandContext.industry,
      loginCustomerId: readOptionalString(params.loginCustomerId),
      objective: readOptionalString(params.objective),
      organizationId: ctx.organizationId,
      platform: readAdsPlatform(params.platform),
      source,
      userId: ctx.userId,
    };
  }

  private async resolveWorkflowBrand(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<Record<string, unknown> | null> {
    if (typeof params.brandId === 'string') {
      const explicitBrand = await this.brandsService.findOne({
        id: params.brandId,
        organizationId: ctx.organizationId,
      });

      if (explicitBrand) {
        return explicitBrand as unknown as Record<string, unknown>;
      }
    }

    const currentBrand = await this.brandsService.findOne({
      isSelected: true,
      organizationId: ctx.organizationId,
      userId: ctx.userId,
    });

    if (currentBrand) {
      return currentBrand as unknown as Record<string, unknown>;
    }

    if (ctx.brandId) {
      const contextBrand = await this.brandsService.findOne({
        id: ctx.brandId,
        organizationId: ctx.organizationId,
      });

      if (contextBrand) {
        return contextBrand as unknown as Record<string, unknown>;
      }
    }

    const firstOrgBrand = await this.brandsService.findOne({
      organizationId: ctx.organizationId,
    });

    return firstOrgBrand
      ? (firstOrgBrand as unknown as Record<string, unknown>)
      : null;
  }
}
