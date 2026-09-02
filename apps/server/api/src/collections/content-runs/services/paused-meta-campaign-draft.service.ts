import { AdCreativeMappingsService } from '@api/collections/ad-creative-mappings/services/ad-creative-mappings.service';
import {
  BRAND_REMIX_DOWNSTREAM_ACTION_IDS,
  BRAND_REMIX_DOWNSTREAM_WORKFLOW_IDS,
  buildBrandRemixMetaPausedDraftWorkflowDefinition,
} from '@api/collections/content-runs/services/brand-remix-downstream-workflow-definition';
import {
  type SystemWorkflowProvenance,
  SystemWorkflowRunnerService,
} from '@api/collections/workflows/system-workflow-runner.service';
import { assertUrlNotPrivate } from '@api/helpers/utils/ssrf/ssrf.util';
import { scopedWhere } from '@api/index';
import {
  MetaAdsService,
  MetaGraphPaginationLimitError,
} from '@api/services/integrations/meta-ads/services/meta-ads.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { IngredientCategory, IngredientStatus } from '@genfeedai/contracts';
import type {
  BrandRemixExecution,
  BrandRemixRunConfig,
} from '@genfeedai/contracts/api-types/contracts/brand-remix-run.contract';
import { CredentialPlatform } from '@genfeedai/prisma';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  type OnModuleInit,
} from '@nestjs/common';

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

type MetaCreative =
  | { imageHash: string }
  | { thumbnailUrl?: string; videoId: string };

type MetaDraftState = {
  adAccountId?: string;
  adId?: string;
  adName: string;
  adSetId?: string;
  adSetName: string;
  campaignId?: string;
  campaignName: string;
  category: IngredientCategory;
  creative?: MetaCreative;
  hasExistingAd?: boolean;
  ingredientId: string;
  input: PausedMetaCampaignDraftInput;
  mediaUrl: string;
  pageId?: string;
  postId: string;
  replayed: boolean;
  result?: PausedMetaCampaignDraftResult;
  workflowLabel?: string;
};

@Injectable()
export class PausedMetaCampaignDraftService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly metaAdsService: MetaAdsService,
    private readonly systemWorkflowRunner: SystemWorkflowRunnerService,
    private readonly adCreativeMappingsService: AdCreativeMappingsService,
  ) {}

  onModuleInit(): void {
    const actions = BRAND_REMIX_DOWNSTREAM_ACTION_IDS;
    this.systemWorkflowRunner.registerAction(
      actions.META_VALIDATE_SOURCE,
      ({ input }) =>
        this.validateSource(input.request as PausedMetaCampaignDraftInput),
    );
    this.systemWorkflowRunner.registerAction(
      actions.META_RESOLVE_ACCOUNT,
      ({ input }) => this.resolveAccount(input.state as MetaDraftState),
    );
    this.systemWorkflowRunner.registerAction(
      actions.META_ENSURE_CAMPAIGN,
      ({ input }) => this.ensureCampaign(input.state as MetaDraftState),
    );
    this.systemWorkflowRunner.registerAction(
      actions.META_ENSURE_AD_SET,
      ({ input }) => this.ensureAdSet(input.state as MetaDraftState),
    );
    this.systemWorkflowRunner.registerAction(
      actions.META_FIND_AD,
      ({ input }) => this.findAd(input.state as MetaDraftState),
    );
    this.systemWorkflowRunner.registerAction(
      actions.META_PREPARE_CREATIVE,
      ({ input }) => this.prepareCreative(this.unwrapState(input.state)),
    );
    this.systemWorkflowRunner.registerAction(
      actions.META_CREATE_AD,
      ({ input }) => this.createAd(input.state as MetaDraftState),
    );
    this.systemWorkflowRunner.registerAction(
      actions.META_PAUSE_CAMPAIGN,
      ({ input }) => this.pauseCampaign(this.unwrapState(input.state)),
    );
    this.systemWorkflowRunner.registerAction(
      actions.META_PAUSE_AD_SET,
      ({ input }) => this.pauseAdSet(input.state as MetaDraftState),
    );
    this.systemWorkflowRunner.registerAction(
      actions.META_PAUSE_AD,
      ({ input }) => this.pauseAd(input.state as MetaDraftState),
    );
    this.systemWorkflowRunner.registerAction(
      actions.META_PERSIST_MAPPING,
      ({ input, provenance }) =>
        this.persistMapping(input.state as MetaDraftState, provenance),
    );
    this.systemWorkflowRunner.registerAction(
      actions.META_PERSIST_LINEAGE,
      ({ input }) => this.persistLineage(input.state as MetaDraftState),
    );
    this.systemWorkflowRunner.registerWorkflow(
      buildBrandRemixMetaPausedDraftWorkflowDefinition(),
    );
  }

  async prepare(
    input: PausedMetaCampaignDraftInput,
  ): Promise<PausedMetaCampaignDraftResult> {
    const { result } =
      await this.systemWorkflowRunner.runWorkflow<PausedMetaCampaignDraftResult>(
        {
          actionType: BRAND_REMIX_DOWNSTREAM_WORKFLOW_IDS.META_PAUSED_DRAFT,
          canonicalId: BRAND_REMIX_DOWNSTREAM_WORKFLOW_IDS.META_PAUSED_DRAFT,
          inputValues: { request: input },
          organizationId: input.organizationId,
          source: 'brand-remix-run',
          userId: input.userId,
        },
      );
    return result;
  }

  private async validateSource(
    input: PausedMetaCampaignDraftInput,
  ): Promise<MetaDraftState> {
    this.assertHttpsUrl(input.linkUrl, 'campaign destination');
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
    const suffix = `${input.runId}-${input.config.revision}-${input.variant.id}`;
    const campaignName = `Genfeed Remix ${suffix}`;
    return {
      adName: `${campaignName} Ad`,
      adSetName: `${campaignName} Ad Set`,
      campaignName,
      category: ingredient.category as IngredientCategory,
      ingredientId,
      input,
      mediaUrl: ingredient.cdnUrl,
      postId: post.id,
      replayed: false,
    };
  }

  private async resolveAccount(state: MetaDraftState): Promise<MetaDraftState> {
    const credential = await this.loadCredential(state.input);
    const accounts = await this.metaAdsService.getAdAccounts(
      credential.accessToken,
    );
    const selected = accounts.find(
      (account) =>
        account.id === state.input.adAccountId ||
        `act_${account.id}` === state.input.adAccountId ||
        account.id === state.input.adAccountId.replace(/^act_/, ''),
    );
    if (!selected) {
      throw new BadRequestException(
        'The selected Meta ad account is unavailable for this credential.',
      );
    }
    return {
      ...state,
      adAccountId: selected.id.startsWith('act_')
        ? selected.id
        : `act_${selected.id}`,
      pageId: credential.pageId,
    };
  }

  private async ensureCampaign(state: MetaDraftState): Promise<MetaDraftState> {
    const accessToken = await this.loadAccessToken(state.input);
    const adAccountId = this.required(state.adAccountId, 'Meta ad account');
    const campaigns = await this.withPaginationGuard(() =>
      this.metaAdsService.listCampaigns(accessToken, adAccountId, {
        limit: 1,
        name: state.campaignName,
      }),
    );
    const existing = campaigns.find(
      (campaign) => campaign.name === state.campaignName,
    );
    const campaignId =
      existing?.id ??
      (await this.metaAdsService.createCampaign(accessToken, adAccountId, {
        dailyBudget: PAUSED_DRAFT_DAILY_BUDGET,
        name: state.campaignName,
        objective: 'OUTCOME_TRAFFIC',
        specialAdCategories: [],
        status: 'PAUSED',
      }));
    return {
      ...state,
      campaignId,
      replayed: state.replayed || Boolean(existing),
    };
  }

  private async ensureAdSet(state: MetaDraftState): Promise<MetaDraftState> {
    const accessToken = await this.loadAccessToken(state.input);
    const adAccountId = this.required(state.adAccountId, 'Meta ad account');
    const campaignId = this.required(state.campaignId, 'Meta campaign');
    const adSets = await this.metaAdsService.listAdSets(
      accessToken,
      adAccountId,
      campaignId,
      { name: state.adSetName },
    );
    const existing = adSets.find((adSet) => adSet.name === state.adSetName);
    const adSetId =
      existing?.id ??
      (await this.metaAdsService.createAdSet(accessToken, adAccountId, {
        billingEvent: 'IMPRESSIONS',
        campaignId,
        name: state.adSetName,
        optimizationGoal: 'LINK_CLICKS',
        targeting: { geoLocations: { countries: ['US'] } },
      }));
    return { ...state, adSetId, replayed: state.replayed || Boolean(existing) };
  }

  private async findAd(state: MetaDraftState): Promise<MetaDraftState> {
    const accessToken = await this.loadAccessToken(state.input);
    const ads = await this.metaAdsService.listAds(
      accessToken,
      this.required(state.adAccountId, 'Meta ad account'),
      this.required(state.adSetId, 'Meta ad set'),
      { name: state.adName },
    );
    const existing = ads.find((ad) => ad.name === state.adName);
    return {
      ...state,
      ...(existing ? { adId: existing.id } : {}),
      hasExistingAd: Boolean(existing),
      replayed: state.replayed || Boolean(existing),
    };
  }

  private async prepareCreative(
    state: MetaDraftState,
  ): Promise<MetaDraftState> {
    const accessToken = await this.loadAccessToken(state.input);
    const adAccountId = this.required(state.adAccountId, 'Meta ad account');
    if (state.category === IngredientCategory.IMAGE) {
      const uploaded = await this.metaAdsService.uploadAdImage(
        accessToken,
        adAccountId,
        state.mediaUrl,
      );
      return { ...state, creative: { imageHash: uploaded.hash } };
    }
    const videos = await this.withPaginationGuard(() =>
      this.metaAdsService.listAdVideos(accessToken, adAccountId, {
        allPages: true,
      }),
    );
    const existing = videos.find((video) => video.title === state.adName);
    const videoId = existing
      ? existing.id
      : (
          await this.metaAdsService.uploadAdVideo(
            accessToken,
            adAccountId,
            state.mediaUrl,
            state.adName,
          )
        ).videoId;
    const thumbnailUrl = await this.metaAdsService.getAdVideoThumbnailUrl(
      accessToken,
      videoId,
    );
    return {
      ...state,
      creative: { thumbnailUrl, videoId },
      replayed: state.replayed || Boolean(existing),
    };
  }

  private async createAd(state: MetaDraftState): Promise<MetaDraftState> {
    const accessToken = await this.loadAccessToken(state.input);
    const creative = state.creative;
    if (!creative) throw new Error('Meta creative is missing');
    const adId = await this.metaAdsService.createAd(
      accessToken,
      this.required(state.adAccountId, 'Meta ad account'),
      {
        adSetId: this.required(state.adSetId, 'Meta ad set'),
        creative: {
          body: state.input.config.draft.intent.objective,
          callToAction: 'LEARN_MORE',
          ...('imageHash' in creative
            ? { imageHash: creative.imageHash }
            : {
                thumbnailUrl: creative.thumbnailUrl,
                videoId: creative.videoId,
              }),
          linkUrl: state.input.linkUrl,
          pageId: this.required(state.pageId, 'Meta Page'),
          title: state.input.config.draft.intent.hook,
        },
        name: state.adName,
      },
    );
    return { ...state, adId };
  }

  private async pauseCampaign(state: MetaDraftState): Promise<MetaDraftState> {
    await this.metaAdsService.pauseCampaign(
      await this.loadAccessToken(state.input),
      this.required(state.campaignId, 'Meta campaign'),
    );
    return state;
  }

  private async pauseAdSet(state: MetaDraftState): Promise<MetaDraftState> {
    await this.metaAdsService.pauseAdSet(
      await this.loadAccessToken(state.input),
      this.required(state.adSetId, 'Meta ad set'),
    );
    return state;
  }

  private async pauseAd(state: MetaDraftState): Promise<MetaDraftState> {
    await this.metaAdsService.pauseAd(
      await this.loadAccessToken(state.input),
      this.required(state.adId, 'Meta ad'),
    );
    return state;
  }

  private async persistMapping(
    state: MetaDraftState,
    provenance: SystemWorkflowProvenance,
  ): Promise<MetaDraftState> {
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
        platform: 'meta',
        status: 'paused',
      });
    }
    return { ...state, result, workflowLabel: provenance.workflowLabel };
  }

  private async persistLineage(
    state: MetaDraftState,
  ): Promise<PausedMetaCampaignDraftResult> {
    const result = state.result;
    if (!result) throw new Error('Meta draft result is missing');
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
    state: MetaDraftState,
    provenance: SystemWorkflowProvenance,
  ): PausedMetaCampaignDraftResult {
    return {
      adAccountId: this.required(state.adAccountId, 'Meta ad account'),
      adId: this.required(state.adId, 'Meta ad'),
      adSetId: this.required(state.adSetId, 'Meta ad set'),
      campaignId: this.required(state.campaignId, 'Meta campaign'),
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

  private async loadCredential(input: PausedMetaCampaignDraftInput): Promise<{
    accessToken: string;
    pageId: string;
  }> {
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
    return {
      accessToken: EncryptionUtil.decrypt(credential.accessToken),
      pageId: credential.externalId,
    };
  }

  private async loadAccessToken(
    input: PausedMetaCampaignDraftInput,
  ): Promise<string> {
    return (await this.loadCredential(input)).accessToken;
  }

  private async withPaginationGuard<T>(
    operation: () => Promise<T>,
  ): Promise<T> {
    try {
      return await operation();
    } catch (error: unknown) {
      if (error instanceof MetaGraphPaginationLimitError) {
        throw new ConflictException(
          'Meta replay lookup exceeded the safe pagination limit; no duplicate object was created.',
        );
      }
      throw error;
    }
  }

  private required(value: string | undefined, label: string): string {
    if (!value) throw new Error(`${label} is missing`);
    return value;
  }

  private unwrapState(value: unknown): MetaDraftState {
    if (value && typeof value === 'object' && 'data' in value) {
      return (value as { data: MetaDraftState }).data;
    }
    return value as MetaDraftState;
  }

  private assertHttpsUrl(url: string, label: string): void {
    assertUrlNotPrivate(url);
    if (new URL(url).protocol !== 'https:') {
      throw new BadRequestException(`${label} must use HTTPS.`);
    }
  }
}
