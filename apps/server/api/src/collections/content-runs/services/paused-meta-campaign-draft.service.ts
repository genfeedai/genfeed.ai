import {
  SYSTEM_WORKFLOW_ACTION_IDS,
  SystemWorkflowProvenanceService,
} from '@api/collections/workflows/services/system-workflow-provenance.service';
import { assertUrlNotPrivate } from '@api/helpers/utils/ssrf/ssrf.util';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type {
  BrandRemixExecution,
  BrandRemixRunConfig,
} from '@api-types/contracts/brand-remix-run.contract';
import { IngredientCategory, IngredientStatus } from '@genfeedai/enums';
import { CredentialPlatform } from '@genfeedai/prisma';
import { scopedWhere } from '@genfeedai/server';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { AdCreativeMappingsService } from '@server/collections/ad-creative-mappings/services/ad-creative-mappings.service';
import { MetaAdsService } from '@server/services/integrations/meta-ads/services/meta-ads.service';

const PAUSED_DRAFT_DAILY_BUDGET = 5;

export interface PausedMetaCampaignDraftInput {
  adAccountId: string;
  brandId: string;
  config: BrandRemixRunConfig;
  credentialId: string;
  linkUrl: string;
  organizationId: string;
  runId: string;
  userId: string;
  variant: BrandRemixExecution['variants'][number];
}

export interface PausedMetaCampaignDraftResult {
  adAccountId: string;
  adId: string;
  adSetId: string;
  campaignId: string;
  credentialId: string;
  ingredientId: string;
  postId: string;
  recipeRevision: number;
  recipeVersion: 1;
  replayed: boolean;
  status: 'PAUSED';
  variantId: string;
  workflowExecutionId: string;
  workflowId: string;
}

@Injectable()
export class PausedMetaCampaignDraftService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly metaAdsService: MetaAdsService,
    private readonly workflowProvenanceService: SystemWorkflowProvenanceService,
    private readonly adCreativeMappingsService: AdCreativeMappingsService,
  ) {}

  async prepare(
    input: PausedMetaCampaignDraftInput,
  ): Promise<PausedMetaCampaignDraftResult> {
    this.assertHttpsUrl(input.linkUrl, 'campaign destination');
    const credential = await this.prisma.credential.findFirst({
      select: { accessToken: true, externalId: true, id: true },
      where: {
        brandId: input.brandId,
        id: input.credentialId,
        isConnected: true,
        isDeleted: false,
        organizationId: input.organizationId,
        platform: CredentialPlatform.FACEBOOK,
      },
    });
    if (!credential?.accessToken || !credential.externalId) {
      throw new BadRequestException(
        'The selected Meta credential or connected Page is unavailable.',
      );
    }
    const accessToken = EncryptionUtil.decrypt(credential.accessToken);
    const accounts = await this.metaAdsService.getAdAccounts(accessToken);
    const selectedAccount = accounts.find(
      (account) =>
        account.id === input.adAccountId ||
        `act_${account.id}` === input.adAccountId ||
        account.id === input.adAccountId.replace(/^act_/, ''),
    );
    if (!selectedAccount) {
      throw new BadRequestException(
        'The selected Meta ad account is unavailable for this credential.',
      );
    }
    const resolvedAdAccountId = selectedAccount.id.startsWith('act_')
      ? selectedAccount.id
      : `act_${selectedAccount.id}`;

    const post = await this.prisma.post.findFirst({
      select: { id: true },
      where: scopedWhere(input.organizationId, {
        brandId: input.brandId,
        contentRunId: input.runId,
        id: { in: input.config.review?.approvedPostIds ?? [] },
        variantId: input.variant.id,
      }),
    });
    const ingredientId = input.variant.assetIds[0];
    if (!post || !ingredientId) {
      throw new ConflictException(
        'The approved Review draft is not linked to a generated media output.',
      );
    }
    const ingredient = await this.prisma.ingredient.findFirst({
      select: { category: true, cdnUrl: true, id: true, status: true },
      where: scopedWhere(input.organizationId, {
        brandId: input.brandId,
        id: ingredientId,
      }),
    });
    if (
      !ingredient?.cdnUrl ||
      ![
        IngredientStatus.GENERATED,
        IngredientStatus.UPLOADED,
        IngredientStatus.VALIDATED,
      ].includes(ingredient.status as IngredientStatus)
    ) {
      throw new ConflictException('The approved media output is not ready.');
    }
    this.assertHttpsUrl(ingredient.cdnUrl, 'approved media');
    const mediaUrl = ingredient.cdnUrl;
    const pageId = credential.externalId;

    const suffix = `${input.runId}-${input.config.revision}-${input.variant.id}`;
    const campaignName = `Genfeed Remix ${suffix}`;
    const adSetName = `${campaignName} Ad Set`;
    const adName = `${campaignName} Ad`;
    const workflow = await this.workflowProvenanceService.runAction(
      {
        actionType: 'prepare-paused-meta-draft',
        canonicalId: SYSTEM_WORKFLOW_ACTION_IDS.BRAND_REMIX_PAUSED_META_DRAFT,
        description: 'Prepare reviewed Meta creative without enabling spend.',
        inputValues: {
          adAccountId: resolvedAdAccountId,
          budgetCurrency: selectedAccount.currency,
          dailyBudget: PAUSED_DRAFT_DAILY_BUDGET,
          runId: input.runId,
          variantId: input.variant.id,
        },
        label: 'Brand Remix Paused Meta Draft',
        organizationId: input.organizationId,
        postIds: [post.id],
        source: 'brand-remix-run',
        userId: input.userId,
      },
      async () => {
        const campaigns = await this.metaAdsService.listCampaigns(
          accessToken,
          resolvedAdAccountId,
          { limit: 200 },
        );
        const existingCampaign = campaigns.find(
          (campaign) => campaign.name === campaignName,
        );
        const campaignId =
          existingCampaign?.id ??
          (await this.metaAdsService.createCampaign(
            accessToken,
            resolvedAdAccountId,
            {
              dailyBudget: PAUSED_DRAFT_DAILY_BUDGET,
              name: campaignName,
              objective: 'OUTCOME_TRAFFIC',
              specialAdCategories: [],
              status: 'PAUSED',
            },
          ));

        const adSets = await this.metaAdsService.listAdSets(
          accessToken,
          resolvedAdAccountId,
          campaignId,
        );
        const existingAdSet = adSets.find((adSet) => adSet.name === adSetName);
        const adSetId =
          existingAdSet?.id ??
          (await this.metaAdsService.createAdSet(
            accessToken,
            resolvedAdAccountId,
            {
              billingEvent: 'IMPRESSIONS',
              campaignId,
              name: adSetName,
              optimizationGoal: 'LINK_CLICKS',
              targeting: { geoLocations: { countries: ['US'] } },
            },
          ));

        const ads = await this.metaAdsService.listAds(
          accessToken,
          resolvedAdAccountId,
          adSetId,
        );
        const existingAd = ads.find((ad) => ad.name === adName);
        let adId = existingAd?.id;
        if (!adId) {
          const creative =
            ingredient.category === IngredientCategory.IMAGE
              ? await this.metaAdsService.uploadAdImage(
                  accessToken,
                  resolvedAdAccountId,
                  mediaUrl,
                )
              : await this.metaAdsService.uploadAdVideo(
                  accessToken,
                  resolvedAdAccountId,
                  mediaUrl,
                  adName,
                );
          adId = await this.metaAdsService.createAd(
            accessToken,
            resolvedAdAccountId,
            {
              adSetId,
              creative: {
                body: input.config.draft.intent.objective,
                callToAction: 'LEARN_MORE',
                ...('hash' in creative
                  ? { imageHash: creative.hash }
                  : { videoId: creative.videoId }),
                linkUrl: input.linkUrl,
                pageId,
                title: input.config.draft.intent.hook,
              },
              name: adName,
            },
          );
        }
        await Promise.all([
          this.metaAdsService.pauseCampaign(accessToken, campaignId),
          this.metaAdsService.pauseAdSet(accessToken, adSetId),
          this.metaAdsService.pauseAd(accessToken, adId),
        ]);
        return { adId, adSetId, campaignId, replayed: Boolean(existingAd) };
      },
    );

    const result: PausedMetaCampaignDraftResult = {
      adAccountId: resolvedAdAccountId,
      adId: workflow.result.adId,
      adSetId: workflow.result.adSetId,
      campaignId: workflow.result.campaignId,
      credentialId: input.credentialId,
      ingredientId,
      postId: post.id,
      recipeRevision: input.config.revision,
      recipeVersion: 1,
      replayed: workflow.result.replayed,
      status: 'PAUSED',
      variantId: input.variant.id,
      workflowExecutionId: workflow.provenance.executionId,
      workflowId: workflow.provenance.workflowId,
    };
    const existingMapping =
      await this.adCreativeMappingsService.findByContentId(
        ingredientId,
        input.organizationId,
      );
    if (existingMapping.length === 0) {
      await this.adCreativeMappingsService.create({
        adAccountId: resolvedAdAccountId,
        brandId: input.brandId,
        externalAdId: result.adId,
        genfeedContentId: ingredientId,
        metadata: { ...result },
        organizationId: input.organizationId,
        platform: 'meta',
        status: 'paused',
      });
    }
    return result;
  }

  private assertHttpsUrl(url: string, label: string): void {
    assertUrlNotPrivate(url);
    if (new URL(url).protocol !== 'https:') {
      throw new BadRequestException(`${label} must use HTTPS.`);
    }
  }
}
