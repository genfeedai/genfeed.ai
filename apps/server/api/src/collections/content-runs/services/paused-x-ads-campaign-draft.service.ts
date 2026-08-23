import {
  SYSTEM_WORKFLOW_ACTION_IDS,
  SystemWorkflowProvenanceService,
} from '@api/collections/workflows/services/system-workflow-provenance.service';
import { XAdsService } from '@api/services/integrations/x-ads/services/x-ads.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type {
  BrandRemixExecution,
  BrandRemixRunConfig,
} from '@api-types/contracts/brand-remix-run.contract';
import { IngredientStatus } from '@genfeedai/enums';
import { CredentialPlatform } from '@genfeedai/prisma';
import { scopedWhere } from '@genfeedai/server';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { AdCreativeMappingsService } from '@server/collections/ad-creative-mappings/services/ad-creative-mappings.service';

export interface PausedXAdsCampaignDraftInput {
  adAccountId: string;
  brandId: string;
  config: BrandRemixRunConfig;
  credentialId: string;
  organizationId: string;
  runId: string;
  /** Id of an existing tweet to promote — X's Ads API has no capability to create new creative. */
  sourceTweetId: string;
  userId: string;
  variant: BrandRemixExecution['variants'][number];
}

export interface PausedXAdsCampaignDraftResult {
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

/**
 * X's Ads API promotes existing tweets — it has no endpoint to create a
 * tweet or upload media as ad creative (unlike Meta, which builds the ad
 * from an uploaded image/video). Callers must supply `sourceTweetId`, the
 * id of an already-published tweet, as the promoted-tweet input. This is a
 * platform-intrinsic constraint of the X Ads API, not a Genfeed shortcut.
 */
@Injectable()
export class PausedXAdsCampaignDraftService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly xAdsService: XAdsService,
    private readonly workflowProvenanceService: SystemWorkflowProvenanceService,
    private readonly adCreativeMappingsService: AdCreativeMappingsService,
  ) {}

  async prepare(
    input: PausedXAdsCampaignDraftInput,
  ): Promise<PausedXAdsCampaignDraftResult> {
    const credential = await this.prisma.credential.findFirst({
      select: {
        accessToken: true,
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
        platform: CredentialPlatform.X_ADS,
      },
    });
    if (!credential?.accessToken) {
      throw new BadRequestException(
        'The selected X Ads credential is unavailable.',
      );
    }
    if (
      !credential.grantedScopesCapturedAt ||
      !credential.grantedScopes.includes('ads.write')
    ) {
      throw new BadRequestException(
        'The selected X Ads credential requires ads.write. Reconnect X Ads and grant ads access.',
      );
    }
    const accessToken = EncryptionUtil.decrypt(credential.accessToken);
    const accounts = await this.xAdsService.getAdAccounts(accessToken);
    const selectedAccount = accounts.find(
      (account) => account.id === input.adAccountId,
    );
    if (!selectedAccount) {
      throw new BadRequestException(
        'The selected X Ads account is unavailable for this credential.',
      );
    }
    const resolvedAdAccountId = selectedAccount.id;

    const fundingInstruments = await this.xAdsService.getFundingInstruments(
      accessToken,
      resolvedAdAccountId,
    );
    const fundingInstrument =
      fundingInstruments.find(
        (instrument) => instrument.entityStatus === 'ACTIVE',
      ) ?? fundingInstruments[0];
    if (!fundingInstrument) {
      throw new BadRequestException(
        'The selected X Ads account has no available funding instrument.',
      );
    }

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
      select: { id: true, status: true },
      where: scopedWhere(input.organizationId, {
        brandId: input.brandId,
        id: ingredientId,
      }),
    });
    if (
      !ingredient ||
      ![
        IngredientStatus.GENERATED,
        IngredientStatus.UPLOADED,
        IngredientStatus.VALIDATED,
      ].includes(ingredient.status as IngredientStatus)
    ) {
      throw new ConflictException('The approved media output is not ready.');
    }

    const suffix = `${input.runId}-${input.config.revision}-${input.variant.id}`;
    const campaignName = `Genfeed Remix ${suffix}`;
    const lineItemName = `${campaignName} Line Item`;
    const workflowRequest = this.workflowProvenanceService.runAction(
      {
        actionType: 'prepare-paused-x-ads-draft',
        canonicalId: SYSTEM_WORKFLOW_ACTION_IDS.BRAND_REMIX_PAUSED_X_ADS_DRAFT,
        description:
          'Prepare reviewed X Ads promoted-tweet draft without enabling spend.',
        inputValues: {
          adAccountId: resolvedAdAccountId,
          fundingInstrumentId: fundingInstrument.id,
          runId: input.runId,
          sourceTweetId: input.sourceTweetId,
          variantId: input.variant.id,
        },
        label: 'Brand Remix Paused X Ads Draft',
        organizationId: input.organizationId,
        postIds: [post.id],
        source: 'brand-remix-run',
        userId: input.userId,
      },
      async () => {
        const campaigns = await this.xAdsService.listCampaigns(
          accessToken,
          resolvedAdAccountId,
        );
        const existingCampaign = campaigns.find(
          (campaign) => campaign.name === campaignName,
        );
        let replayed = Boolean(existingCampaign);
        const campaign =
          existingCampaign ??
          (await this.xAdsService.createCampaign(
            accessToken,
            resolvedAdAccountId,
            {
              entityStatus: 'PAUSED',
              fundingInstrumentId: fundingInstrument.id,
              name: campaignName,
            },
          ));

        const lineItems = await this.xAdsService.listLineItems(
          accessToken,
          resolvedAdAccountId,
          campaign.id,
        );
        const existingLineItem = lineItems.find(
          (lineItem) => lineItem.name === lineItemName,
        );
        replayed ||= Boolean(existingLineItem);
        const lineItem =
          existingLineItem ??
          (await this.xAdsService.createLineItem(
            accessToken,
            resolvedAdAccountId,
            {
              campaignId: campaign.id,
              entityStatus: 'PAUSED',
              name: lineItemName,
              objective: 'ENGAGEMENTS',
              placements: ['ALL_ON_TWITTER'],
              productType: 'PROMOTED_TWEETS',
            },
          ));

        const promotedTweets = await this.xAdsService.listPromotedTweets(
          accessToken,
          resolvedAdAccountId,
          lineItem.id,
        );
        const existingPromotedTweet = promotedTweets.find(
          (promotedTweet) => promotedTweet.tweetId === input.sourceTweetId,
        );
        replayed ||= Boolean(existingPromotedTweet);
        const promotedTweet =
          existingPromotedTweet ??
          (await this.xAdsService.createPromotedTweet(
            accessToken,
            resolvedAdAccountId,
            {
              lineItemId: lineItem.id,
              tweetId: input.sourceTweetId,
            },
          ));

        return {
          adId: promotedTweet.id,
          adSetId: lineItem.id,
          campaignId: campaign.id,
          replayed,
        };
      },
    );
    const workflow = await workflowRequest;

    const result: PausedXAdsCampaignDraftResult = {
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
        platform: 'x',
        status: 'paused',
      });
    }
    return result;
  }
}
