import type {
  BrandRemixExecution,
  BrandRemixRunConfig,
} from '@api-types/contracts/brand-remix-run.contract';
import { CredentialPlatform, IngredientStatus } from '@genfeedai/enums';
import { CredentialPlatform as PrismaCredentialPlatform } from '@genfeedai/prisma';
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
import type { XAdsRequestCredentials } from '@server/services/integrations/x-ads/interfaces/x-ads.interface';
import { XAdsService } from '@server/services/integrations/x-ads/services/x-ads.service';
import { PrismaService } from '@server/shared/modules/prisma/prisma.service';

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
export class PausedXAdsCampaignDraftService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly xAdsService: XAdsService,
    private readonly systemWorkflowRunner: SystemWorkflowRunnerService,
    private readonly adCreativeMappingsService: AdCreativeMappingsService,
  ) {}

  onModuleInit(): void {
    this.systemWorkflowRunner.registerAction(
      SYSTEM_WORKFLOW_ACTION_IDS.BRAND_REMIX_PAUSED_X_ADS_DRAFT,
      ({ input, provenance }) =>
        this.prepareAction(
          input as unknown as PausedXAdsCampaignDraftInput,
          provenance,
        ),
    );
  }

  async prepare(
    input: PausedXAdsCampaignDraftInput,
  ): Promise<PausedXAdsCampaignDraftResult> {
    const { result } =
      await this.systemWorkflowRunner.runAction<PausedXAdsCampaignDraftResult>({
        actionType: 'prepare-paused-x-ads-draft',
        canonicalId: SYSTEM_WORKFLOW_ACTION_IDS.BRAND_REMIX_PAUSED_X_ADS_DRAFT,
        inputValues: input as unknown as Record<string, unknown>,
        organizationId: input.organizationId,
        source: 'brand-remix-run',
        userId: input.userId,
      });
    return result;
  }

  private async prepareAction(
    input: PausedXAdsCampaignDraftInput,
    provenance: SystemWorkflowProvenance,
  ): Promise<PausedXAdsCampaignDraftResult> {
    const credential = await this.prisma.credential.findFirst({
      select: {
        accessToken: true,
        accessTokenSecret: true,
        id: true,
      },
      where: {
        brandId: input.brandId,
        id: input.credentialId,
        isConnected: true,
        isDeleted: false,
        organizationId: input.organizationId,
        platform: PrismaCredentialPlatform.X_ADS,
      },
    });
    if (!credential?.accessToken || !credential.accessTokenSecret) {
      throw new BadRequestException(
        'The selected X Ads credential is unavailable.',
      );
    }
    const oauthCredentials: XAdsRequestCredentials = {
      accessToken: EncryptionUtil.decrypt(credential.accessToken),
      accessTokenSecret: EncryptionUtil.decrypt(credential.accessTokenSecret),
    };
    const accounts = await this.xAdsService.getAdAccounts(oauthCredentials);
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
      oauthCredentials,
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
      select: { externalId: true, id: true, platform: true },
      where: scopedWhere(input.organizationId, {
        brandId: input.brandId,
        contentRunId: input.runId,
        externalId: input.sourceTweetId,
        id: { in: input.config.review?.approvedPostIds ?? [] },
        platform: CredentialPlatform.TWITTER,
        variantId: input.variant.id,
      }),
    });
    const ingredientId = input.variant.assetIds[0];
    if (
      !post ||
      post.externalId !== input.sourceTweetId ||
      post.platform !== CredentialPlatform.TWITTER
    ) {
      throw new ConflictException(
        'The approved Review draft is not the supplied published X post.',
      );
    }
    if (!ingredientId) {
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

    const publishedTweets = await this.xAdsService.listPublishedTweets(
      oauthCredentials,
      resolvedAdAccountId,
      [input.sourceTweetId],
    );
    if (!publishedTweets.some((tweet) => tweet.id === input.sourceTweetId)) {
      throw new BadRequestException(
        'The published Tweet is unavailable to the selected X Ads account promotable user.',
      );
    }

    const suffix = `${input.runId}-${input.config.revision}-${input.variant.id}`;
    const campaignName = `Genfeed Remix ${suffix}`;
    const lineItemName = `${campaignName} Line Item`;
    const campaigns = await this.xAdsService.listCampaigns(
      oauthCredentials,
      resolvedAdAccountId,
    );
    const existingCampaign = campaigns.find(
      (campaign) => campaign.name === campaignName,
    );
    let replayed = Boolean(existingCampaign);
    const campaign =
      existingCampaign ??
      (await this.xAdsService.createCampaign(
        oauthCredentials,
        resolvedAdAccountId,
        {
          entityStatus: 'PAUSED',
          fundingInstrumentId: fundingInstrument.id,
          name: campaignName,
        },
      ));

    const lineItems = await this.xAdsService.listLineItems(
      oauthCredentials,
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
        oauthCredentials,
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
      oauthCredentials,
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
        oauthCredentials,
        resolvedAdAccountId,
        {
          lineItemId: lineItem.id,
          tweetId: input.sourceTweetId,
        },
      ));

    const result: PausedXAdsCampaignDraftResult = {
      adAccountId: resolvedAdAccountId,
      adId: promotedTweet.id,
      adSetId: lineItem.id,
      campaignId: campaign.id,
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
        platform: 'x',
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
}
