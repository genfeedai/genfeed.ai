import { AdCreativeMappingsService } from '@api/collections/ad-creative-mappings/services/ad-creative-mappings.service';
import {
  BRAND_REMIX_DOWNSTREAM_ACTION_IDS,
  BRAND_REMIX_DOWNSTREAM_WORKFLOW_IDS,
  buildBrandRemixXPausedDraftWorkflowDefinition,
} from '@api/collections/content-runs/services/brand-remix-downstream-workflow-definition';
import {
  type SystemWorkflowProvenance,
  SystemWorkflowRunnerService,
} from '@api/collections/workflows/system-workflow-runner.service';
import { scopedWhere } from '@api/index';
import type { XAdsRequestCredentials } from '@api/services/integrations/x-ads/interfaces/x-ads.interface';
import { XAdsService } from '@api/services/integrations/x-ads/services/x-ads.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { CredentialPlatform, IngredientStatus } from '@genfeedai/contracts';
import type {
  BrandRemixExecution,
  BrandRemixRunConfig,
} from '@genfeedai/contracts/api-types/contracts/brand-remix-run.contract';
import { CredentialPlatform as PrismaCredentialPlatform } from '@genfeedai/prisma';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  type OnModuleInit,
} from '@nestjs/common';

export interface PausedXAdsCampaignDraftInput {
  adAccountId: string;
  brandId: string;
  config: BrandRemixRunConfig;
  credentialId: string;
  organizationId: string;
  runId: string;
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

type XDraftState = {
  adAccountId?: string;
  campaignId?: string;
  campaignName: string;
  fundingInstrumentId?: string;
  ingredientId: string;
  input: PausedXAdsCampaignDraftInput;
  lineItemId?: string;
  lineItemName: string;
  postId: string;
  promotedTweetId?: string;
  replayed: boolean;
  result?: PausedXAdsCampaignDraftResult;
  workflowLabel?: string;
};

@Injectable()
export class PausedXAdsCampaignDraftService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly xAdsService: XAdsService,
    private readonly systemWorkflowRunner: SystemWorkflowRunnerService,
    private readonly adCreativeMappingsService: AdCreativeMappingsService,
  ) {}

  onModuleInit(): void {
    const actions = BRAND_REMIX_DOWNSTREAM_ACTION_IDS;
    this.systemWorkflowRunner.registerAction(
      actions.X_VALIDATE_SOURCE,
      ({ input }) =>
        this.validateSource(input.request as PausedXAdsCampaignDraftInput),
    );
    this.systemWorkflowRunner.registerAction(
      actions.X_RESOLVE_ACCOUNT,
      ({ input }) => this.resolveAccount(input.state as XDraftState),
    );
    this.systemWorkflowRunner.registerAction(
      actions.X_RESOLVE_FUNDING,
      ({ input }) => this.resolveFunding(input.state as XDraftState),
    );
    this.systemWorkflowRunner.registerAction(
      actions.X_VALIDATE_TWEET,
      ({ input }) => this.validateTweet(input.state as XDraftState),
    );
    this.systemWorkflowRunner.registerAction(
      actions.X_ENSURE_CAMPAIGN,
      ({ input }) => this.ensureCampaign(input.state as XDraftState),
    );
    this.systemWorkflowRunner.registerAction(
      actions.X_ENSURE_LINE_ITEM,
      ({ input }) => this.ensureLineItem(input.state as XDraftState),
    );
    this.systemWorkflowRunner.registerAction(
      actions.X_ENSURE_PROMOTED_TWEET,
      ({ input }) => this.ensurePromotedTweet(input.state as XDraftState),
    );
    this.systemWorkflowRunner.registerAction(
      actions.X_PERSIST_MAPPING,
      ({ input, provenance }) =>
        this.persistMapping(input.state as XDraftState, provenance),
    );
    this.systemWorkflowRunner.registerAction(
      actions.X_PERSIST_LINEAGE,
      ({ input }) => this.persistLineage(input.state as XDraftState),
    );
    this.systemWorkflowRunner.registerWorkflow(
      buildBrandRemixXPausedDraftWorkflowDefinition(),
    );
  }

  async prepare(
    input: PausedXAdsCampaignDraftInput,
  ): Promise<PausedXAdsCampaignDraftResult> {
    const { result } =
      await this.systemWorkflowRunner.runWorkflow<PausedXAdsCampaignDraftResult>(
        {
          actionType: BRAND_REMIX_DOWNSTREAM_WORKFLOW_IDS.X_PAUSED_DRAFT,
          canonicalId: BRAND_REMIX_DOWNSTREAM_WORKFLOW_IDS.X_PAUSED_DRAFT,
          inputValues: { request: input },
          organizationId: input.organizationId,
          source: 'brand-remix-run',
          userId: input.userId,
        },
      );
    return result;
  }

  private async validateSource(
    input: PausedXAdsCampaignDraftInput,
  ): Promise<XDraftState> {
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
    const suffix = `${input.runId}-${input.config.revision}-${input.variant.id}`;
    const campaignName = `Genfeed Remix ${suffix}`;
    return {
      campaignName,
      ingredientId,
      input,
      lineItemName: `${campaignName} Line Item`,
      postId: post.id,
      replayed: false,
    };
  }

  private async resolveAccount(state: XDraftState): Promise<XDraftState> {
    const credentials = await this.loadCredentials(state.input);
    const accounts = await this.xAdsService.getAdAccounts(credentials);
    const selected = accounts.find(
      (account) => account.id === state.input.adAccountId,
    );
    if (!selected) {
      throw new BadRequestException(
        'The selected X Ads account is unavailable for this credential.',
      );
    }
    return { ...state, adAccountId: selected.id };
  }

  private async resolveFunding(state: XDraftState): Promise<XDraftState> {
    const instruments = await this.xAdsService.getFundingInstruments(
      await this.loadCredentials(state.input),
      this.required(state.adAccountId, 'X Ads account'),
    );
    const selected =
      instruments.find((instrument) => instrument.entityStatus === 'ACTIVE') ??
      instruments[0];
    if (!selected) {
      throw new BadRequestException(
        'The selected X Ads account has no available funding instrument.',
      );
    }
    return { ...state, fundingInstrumentId: selected.id };
  }

  private async validateTweet(state: XDraftState): Promise<XDraftState> {
    const tweets = await this.xAdsService.listPublishedTweets(
      await this.loadCredentials(state.input),
      this.required(state.adAccountId, 'X Ads account'),
      [state.input.sourceTweetId],
    );
    if (!tweets.some((tweet) => tweet.id === state.input.sourceTweetId)) {
      throw new BadRequestException(
        'The published Tweet is unavailable to the selected X Ads account promotable user.',
      );
    }
    return state;
  }

  private async ensureCampaign(state: XDraftState): Promise<XDraftState> {
    const credentials = await this.loadCredentials(state.input);
    const adAccountId = this.required(state.adAccountId, 'X Ads account');
    const campaigns = await this.xAdsService.listCampaigns(
      credentials,
      adAccountId,
    );
    const existing = campaigns.find(
      (campaign) => campaign.name === state.campaignName,
    );
    const campaign =
      existing ??
      (await this.xAdsService.createCampaign(credentials, adAccountId, {
        entityStatus: 'PAUSED',
        fundingInstrumentId: this.required(
          state.fundingInstrumentId,
          'X Ads funding instrument',
        ),
        name: state.campaignName,
      }));
    return {
      ...state,
      campaignId: campaign.id,
      replayed: state.replayed || Boolean(existing),
    };
  }

  private async ensureLineItem(state: XDraftState): Promise<XDraftState> {
    const credentials = await this.loadCredentials(state.input);
    const adAccountId = this.required(state.adAccountId, 'X Ads account');
    const campaignId = this.required(state.campaignId, 'X Ads campaign');
    const lineItems = await this.xAdsService.listLineItems(
      credentials,
      adAccountId,
      campaignId,
    );
    const existing = lineItems.find(
      (lineItem) => lineItem.name === state.lineItemName,
    );
    const lineItem =
      existing ??
      (await this.xAdsService.createLineItem(credentials, adAccountId, {
        campaignId,
        entityStatus: 'PAUSED',
        name: state.lineItemName,
        objective: 'ENGAGEMENTS',
        placements: ['ALL_ON_TWITTER'],
        productType: 'PROMOTED_TWEETS',
      }));
    return {
      ...state,
      lineItemId: lineItem.id,
      replayed: state.replayed || Boolean(existing),
    };
  }

  private async ensurePromotedTweet(state: XDraftState): Promise<XDraftState> {
    const credentials = await this.loadCredentials(state.input);
    const adAccountId = this.required(state.adAccountId, 'X Ads account');
    const lineItemId = this.required(state.lineItemId, 'X Ads line item');
    const promotedTweets = await this.xAdsService.listPromotedTweets(
      credentials,
      adAccountId,
      lineItemId,
    );
    const existing = promotedTweets.find(
      (promotedTweet) => promotedTweet.tweetId === state.input.sourceTweetId,
    );
    const promotedTweet =
      existing ??
      (await this.xAdsService.createPromotedTweet(credentials, adAccountId, {
        lineItemId,
        tweetId: state.input.sourceTweetId,
      }));
    return {
      ...state,
      promotedTweetId: promotedTweet.id,
      replayed: state.replayed || Boolean(existing),
    };
  }

  private async persistMapping(
    state: XDraftState,
    provenance: SystemWorkflowProvenance,
  ): Promise<XDraftState> {
    const result = this.toResult(state, provenance);
    const existing = await this.adCreativeMappingsService.findByContentId(
      state.ingredientId,
      state.input.organizationId,
    );
    if (existing.length === 0) {
      await this.adCreativeMappingsService.create({
        adAccountId: result.adAccountId,
        brandId: state.input.brandId,
        externalAdId: result.adId,
        genfeedContentId: state.ingredientId,
        metadata: { ...result },
        organizationId: state.input.organizationId,
        platform: 'x',
        status: 'paused',
      });
    }
    return { ...state, result, workflowLabel: provenance.workflowLabel };
  }

  private async persistLineage(
    state: XDraftState,
  ): Promise<PausedXAdsCampaignDraftResult> {
    const result = state.result;
    if (!result) throw new Error('X Ads draft result is missing');
    await this.prisma.post.updateMany({
      data: {
        sourceWorkflowId: result.workflowId,
        sourceWorkflowName: state.workflowLabel,
        workflowExecutionId: result.workflowExecutionId,
      },
      where: scopedWhere(state.input.organizationId, { id: state.postId }),
    });
    return result;
  }

  private toResult(
    state: XDraftState,
    provenance: SystemWorkflowProvenance,
  ): PausedXAdsCampaignDraftResult {
    return {
      adAccountId: this.required(state.adAccountId, 'X Ads account'),
      adId: this.required(state.promotedTweetId, 'X Ads promoted Tweet'),
      adSetId: this.required(state.lineItemId, 'X Ads line item'),
      campaignId: this.required(state.campaignId, 'X Ads campaign'),
      credentialId: state.input.credentialId,
      ingredientId: state.ingredientId,
      postId: state.postId,
      recipeRevision: state.input.config.revision,
      recipeVersion: 1,
      replayed: state.replayed,
      status: 'PAUSED',
      variantId: state.input.variant.id,
      workflowExecutionId: provenance.executionId,
      workflowId: provenance.workflowId,
    };
  }

  private async loadCredentials(
    input: PausedXAdsCampaignDraftInput,
  ): Promise<XAdsRequestCredentials> {
    const credential = await this.prisma.credential.findFirst({
      select: { accessToken: true, accessTokenSecret: true, id: true },
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
    return {
      accessToken: EncryptionUtil.decrypt(credential.accessToken),
      accessTokenSecret: EncryptionUtil.decrypt(credential.accessTokenSecret),
    };
  }

  private required(value: string | undefined, label: string): string {
    if (!value) throw new Error(`${label} is missing`);
    return value;
  }
}
