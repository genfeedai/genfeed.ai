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
  type OnModuleInit,
} from '@nestjs/common';
import { AdCreativeMappingsService } from '@server/collections/ad-creative-mappings/services/ad-creative-mappings.service';
import {
  SYSTEM_WORKFLOW_ACTION_IDS,
  type SystemWorkflowProvenance,
  SystemWorkflowRunnerService,
} from '@server/collections/workflows/system-workflow-runner.service';
import { assertUrlNotPrivate } from '@server/helpers/utils/ssrf/ssrf.util';
import {
  MetaAdsService,
  MetaGraphPaginationLimitError,
} from '@server/services/integrations/meta-ads/services/meta-ads.service';
import { PrismaService } from '@server/shared/modules/prisma/prisma.service';

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
export class PausedMetaCampaignDraftService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly metaAdsService: MetaAdsService,
    private readonly systemWorkflowRunner: SystemWorkflowRunnerService,
    private readonly adCreativeMappingsService: AdCreativeMappingsService,
  ) {}

  onModuleInit(): void {
    this.systemWorkflowRunner.registerAction(
      SYSTEM_WORKFLOW_ACTION_IDS.BRAND_REMIX_PAUSED_META_DRAFT,
      ({ input, provenance }) =>
        this.prepareAction(
          input as unknown as PausedMetaCampaignDraftInput,
          provenance,
        ),
    );
  }

  async prepare(
    input: PausedMetaCampaignDraftInput,
  ): Promise<PausedMetaCampaignDraftResult> {
    return this.systemWorkflowRunner
      .runAction<PausedMetaCampaignDraftResult>({
        actionType: 'prepare-paused-meta-draft',
        canonicalId: SYSTEM_WORKFLOW_ACTION_IDS.BRAND_REMIX_PAUSED_META_DRAFT,
        inputValues: input as unknown as Record<string, unknown>,
        organizationId: input.organizationId,
        source: 'brand-remix-run',
        userId: input.userId,
      })
      .then(({ result }) => result)
      .catch((error: unknown) => {
        if (error instanceof MetaGraphPaginationLimitError) {
          throw new ConflictException(
            'Meta replay lookup exceeded the safe pagination limit; no duplicate object was created.',
          );
        }
        throw error;
      });
  }

  private async prepareAction(
    input: PausedMetaCampaignDraftInput,
    provenance: SystemWorkflowProvenance,
  ): Promise<PausedMetaCampaignDraftResult> {
    this.assertHttpsUrl(input.linkUrl, 'campaign destination');
    const credential = await this.prisma.credential.findFirst({
      select: {
        accessToken: true,
        externalId: true,
        grantedScopes: true,
        grantedScopesCapturedAt: true,
        id: true,
      },
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
    if (
      !credential.grantedScopesCapturedAt ||
      !credential.grantedScopes.includes('ads_management')
    ) {
      throw new BadRequestException(
        'The selected Meta credential requires ads_management. Reconnect Meta and grant ads access.',
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
    const campaigns = await this.metaAdsService.listCampaigns(
      accessToken,
      resolvedAdAccountId,
      { limit: 1, name: campaignName },
    );
    const existingCampaign = campaigns.find(
      (campaign) => campaign.name === campaignName,
    );
    let replayed = Boolean(existingCampaign);
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
      { name: adSetName },
    );
    const existingAdSet = adSets.find((adSet) => adSet.name === adSetName);
    replayed ||= Boolean(existingAdSet);
    const adSetId =
      existingAdSet?.id ??
      (await this.metaAdsService.createAdSet(accessToken, resolvedAdAccountId, {
        billingEvent: 'IMPRESSIONS',
        campaignId,
        name: adSetName,
        optimizationGoal: 'LINK_CLICKS',
        targeting: { geoLocations: { countries: ['US'] } },
      }));

    const ads = await this.metaAdsService.listAds(
      accessToken,
      resolvedAdAccountId,
      adSetId,
      { name: adName },
    );
    const existingAd = ads.find((ad) => ad.name === adName);
    replayed ||= Boolean(existingAd);
    let adId = existingAd?.id;
    if (!adId) {
      const creative = await (async () => {
        if (ingredient.category === IngredientCategory.IMAGE) {
          return this.metaAdsService.uploadAdImage(
            accessToken,
            resolvedAdAccountId,
            mediaUrl,
          );
        }
        const uploadedVideos = await this.metaAdsService.listAdVideos(
          accessToken,
          resolvedAdAccountId,
          { allPages: true },
        );
        const existingVideo = uploadedVideos.find(
          (video) => video.title === adName,
        );
        replayed ||= Boolean(existingVideo);
        return (
          (existingVideo ? { videoId: existingVideo.id } : undefined) ??
          (await this.metaAdsService.uploadAdVideo(
            accessToken,
            resolvedAdAccountId,
            mediaUrl,
            adName,
          ))
        );
      })();
      const thumbnailUrl =
        'videoId' in creative
          ? await this.metaAdsService.getAdVideoThumbnailUrl(
              accessToken,
              creative.videoId,
            )
          : undefined;
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
              : { thumbnailUrl, videoId: creative.videoId }),
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

    const result: PausedMetaCampaignDraftResult = {
      adAccountId: resolvedAdAccountId,
      adId,
      adSetId,
      campaignId,
      credentialId: input.credentialId,
      ingredientId,
      postId: post.id,
      recipeRevision: input.config.revision,
      recipeVersion: 1,
      replayed,
      status: 'PAUSED',
      variantId: input.variant.id,
      workflowExecutionId: provenance.executionId,
      workflowId: provenance.workflowId,
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
    await this.prisma.post.updateMany({
      data: {
        sourceWorkflowId: provenance.workflowId,
        sourceWorkflowName: provenance.workflowLabel,
        workflowExecutionId: provenance.executionId,
      },
      where: scopedWhere(input.organizationId, { id: post.id }),
    });
    return result;
  }

  private assertHttpsUrl(url: string, label: string): void {
    assertUrlNotPrivate(url);
    if (new URL(url).protocol !== 'https:') {
      throw new BadRequestException(`${label} must use HTTPS.`);
    }
  }
}
