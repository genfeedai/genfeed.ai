import { CreateAgentGoalDto } from '@api/collections/agent-goals/dto/create-agent-goal.dto';
import { UpdateAgentGoalDto } from '@api/collections/agent-goals/dto/update-agent-goal.dto';
import { AgentGoalsService } from '@api/collections/agent-goals/services/agent-goals.service';
import { AgentMemoryCaptureService } from '@api/collections/agent-memories/services/agent-memory-capture.service';
import { resolveEffectiveBrandAgentConfig } from '@api/collections/brands/utils/brand-agent-config-resolution.util';
import { ContentGeneratorService } from '@api/collections/content-intelligence/services/content-generator.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { computeNextRunAtOrThrow } from '@api/collections/cron-jobs/services/cron-jobs.service';
import { ImagesService } from '@api/collections/images/services/images.service';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import { CreateOutreachCampaignDto } from '@api/collections/outreach-campaigns/dto/create-outreach-campaign.dto';
import { OutreachCampaignsService } from '@api/collections/outreach-campaigns/services/outreach-campaigns.service';
import { PostAnalyticsService } from '@api/collections/posts/services/post-analytics.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { TrendsService } from '@api/collections/trends/services/trends.service';
import { UsersService } from '@api/collections/users/services/users.service';
import { VoicesService } from '@api/collections/voices/services/voices.service';
import { VoteEntity } from '@api/collections/votes/entities/vote.entity';
import { VotesService } from '@api/collections/votes/services/votes.service';
import { WorkflowExecutorService } from '@api/collections/workflows/services/workflow-executor.service';
import { WorkflowGenerationService } from '@api/collections/workflows/services/workflow-generation.service';
import { WorkflowsService } from '@api/collections/workflows/services/workflows.service';
import { ConfigService } from '@api/config/config.service';
import { AdsResearchService } from '@api/endpoints/ads-research/ads-research.service';
import {
  type AiActionResult,
  AiActionsService,
} from '@api/endpoints/ai-actions/ai-actions.service';
import {
  AiActionType,
  type ExecuteAiActionDto,
} from '@api/endpoints/ai-actions/dto/ai-action.dto';
import { AnalyticsService } from '@api/endpoints/analytics/analytics.service';
import { runEffectPromise } from '@api/helpers/utils/effect/effect.util';
import { MarketplaceApiClient } from '@api/marketplace-integration/marketplace-api-client';
import { MarketplaceInstallService } from '@api/marketplace-integration/marketplace-install.service';
import { AgentStreamPublisherService } from '@api/services/agent-orchestrator/agent-stream-publisher.service';
import { AgentSpawnService } from '@api/services/agent-spawn/agent-spawn.service';
import { BatchGenerationService } from '@api/services/batch-generation/batch-generation.service';
import { ContentQualityScorerService } from '@api/services/content-quality/content-quality-scorer.service';
import { ClerkService } from '@api/services/integrations/clerk/clerk.service';
import { isEEEnabled } from '@genfeedai/config';
import {
  AgentType,
  BotCategory,
  BotPlatform,
  BotStatus,
  CampaignPlatform,
  CampaignType,
  CredentialPlatform,
  IngredientCategory,
  IngredientStatus,
  PostCategory,
  PostStatus,
  Status,
  VoiceCloneStatus,
  VoteEntityModel,
  WorkflowTrigger,
} from '@genfeedai/enums';
import type {
  AgentDashboardOperation,
  AgentIngredientItem,
  AgentToolResult,
  AgentUIBlock,
  AgentUiAction,
  ChartBlock,
  KPIGridBlock,
  TableBlock,
  TopPostsBlock,
} from '@genfeedai/interfaces';
import { AgentToolName } from '@genfeedai/interfaces';
import type {
  AdsChannel,
  AdsResearchFilters,
  AdsResearchPlatform,
  AdsResearchSource,
} from '@genfeedai/interfaces/integrations/ads-research.interface';
import {
  serializeAgentBrand,
  serializeAgentBrands,
} from '@genfeedai/serializers';
import {
  type IOnboardingJourneyMissionState,
  ONBOARDING_JOURNEY_MISSIONS,
  ONBOARDING_JOURNEY_TOTAL_CREDITS,
  type OnboardingJourneyMissionId,
} from '@genfeedai/types';
import { formatRecurringSchedule } from '@helpers/formatting/recurring-schedule/recurring-schedule.helper';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { Inject, Injectable, Optional } from '@nestjs/common';
import { Effect } from 'effect';
import { Types } from 'mongoose';
import { firstValueFrom } from 'rxjs';

interface ToolExecutionContext {
  /** URLs of user-attached images from the chat message */
  attachmentUrls?: string[];
  userId: string;
  organizationId: string;
  threadId?: string;
  authToken?: string;
  generationPriority?: string;
  qualityTier?: 'budget' | 'balanced' | 'high_quality';
  thinkingModel?: string;
  generationModelOverride?: string | null;
  reviewModelOverride?: string | null;
  autonomyMode?: string;
  creditGovernance?: {
    useOrganizationPool?: boolean;
    brandDailyCreditCap?: number | null;
    agentDailyCreditCap?: number | null;
  };
  brandId?: string;
  platform?: string;
  /** Agent run ID for content attribution */
  runId?: string;
  /** Agent strategy ID for content attribution */
  strategyId?: string;
  /** Keep batch generation attached to the current live run and stream item previews */
  streamBatchToUser?: boolean;
}

interface DashboardHydrationState {
  status?: 'idle' | 'loading' | 'ready';
  staggerMs?: number;
}

type HydratableDashboardBlock<T extends AgentUIBlock = AgentUIBlock> = T & {
  hydration?: DashboardHydrationState;
};

type OfficialWorkflowSourceKind =
  | 'generated'
  | 'marketplace-listing'
  | 'seeded-template';

interface OfficialWorkflowSource {
  id: string;
  kind: OfficialWorkflowSourceKind;
  name: string;
  description?: string;
  confidence: number;
  slug?: string;
  price?: number;
  pricingTier?: string;
}

type LivestreamBotPlatform = 'youtube' | 'twitch';
type LivestreamBotMessageType =
  | 'scheduled_link_drop'
  | 'scheduled_host_prompt'
  | 'context_aware_question';
type RecurringTaskContentType = 'image' | 'video' | 'post' | 'newsletter';

const CREATE_LIVESTREAM_BOT_TOOL = 'create_livestream_bot' as AgentToolName;
const MANAGE_LIVESTREAM_BOT_TOOL = 'manage_livestream_bot' as AgentToolName;
const LIST_ADS_RESEARCH_TOOL = 'list_ads_research' as AgentToolName;
const GET_AD_RESEARCH_DETAIL_TOOL = 'get_ad_research_detail' as AgentToolName;
const CREATE_AD_REMIX_WORKFLOW_TOOL =
  'create_ad_remix_workflow' as AgentToolName;
const GENERATE_AD_PACK_TOOL = 'generate_ad_pack' as AgentToolName;
const PREPARE_AD_LAUNCH_REVIEW_TOOL =
  'prepare_ad_launch_review' as AgentToolName;
const DRAFT_BRAND_VOICE_PROFILE_TOOL =
  'draft_brand_voice_profile' as AgentToolName;
const SAVE_BRAND_VOICE_PROFILE_TOOL =
  'save_brand_voice_profile' as AgentToolName;
const GET_WORKFLOW_INPUTS_TOOL = 'get_workflow_inputs' as AgentToolName;
const LIVESTREAM_BOT_CATEGORY = 'livestream_chat';

interface AgentLivestreamBotRecord {
  _id: unknown;
  brand?: unknown;
  category?: string;
  label: string;
  livestreamSettings?: Record<string, unknown>;
  organization?: unknown;
  platforms?: string[];
  targets?: Array<Record<string, unknown>>;
  user?: unknown;
}

interface AgentLivestreamSessionRecord {
  context?: Record<string, unknown>;
  deliveryHistory?: Record<string, unknown>[];
  platformStates?: Record<string, unknown>[];
  status?: string;
}

interface AgentBrandsServiceLike {
  create: (
    createDto: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>;
  findAll: (
    aggregate: Record<string, unknown>[],
    options: Record<string, unknown>,
  ) => Promise<{ docs?: Record<string, unknown>[] }>;
  findOne: (
    params: Record<string, unknown>,
    context?: string,
  ) => Promise<Record<string, unknown> | null>;
  generateBrandVoice?: (
    dto: {
      brandId?: string;
      examplesToAvoid?: string[];
      examplesToEmulate?: string[];
      industry?: string;
      offering?: string;
      targetAudience?: string;
      url?: string;
    },
    organizationId: string,
  ) => Promise<{
    audience: string[];
    doNotSoundLike: string[];
    hashtags: string[];
    messagingPillars: string[];
    sampleOutput: string;
    style: string;
    taglines: string[];
    tone: string;
    values: string[];
  }>;
  updateAgentConfig?: (
    brandId: string,
    orgId: string,
    agentConfig: Record<string, unknown>,
  ) => Promise<Record<string, unknown> | null>;
}

interface AgentBotsServiceLike {
  create: (
    createDto: Record<string, unknown>,
  ) => Promise<AgentLivestreamBotRecord>;
  findOne: (
    query: Record<string, unknown>,
  ) => Promise<AgentLivestreamBotRecord | null>;
}

interface AgentBotsLivestreamServiceLike {
  getOrCreateSession: (
    bot: AgentLivestreamBotRecord,
  ) => Promise<AgentLivestreamSessionRecord>;
  pauseSession: (
    bot: AgentLivestreamBotRecord,
  ) => Promise<AgentLivestreamSessionRecord>;
  resumeSession: (
    bot: AgentLivestreamBotRecord,
  ) => Promise<AgentLivestreamSessionRecord>;
  sendNow: (
    bot: AgentLivestreamBotRecord,
    payload: {
      message?: string;
      platform: LivestreamBotPlatform;
      type?: LivestreamBotMessageType;
    },
  ) => Promise<AgentLivestreamSessionRecord>;
  setManualOverride: (
    bot: AgentLivestreamBotRecord,
    payload: {
      activeLinkId?: string;
      promotionAngle?: string;
      topic?: string;
    },
  ) => Promise<AgentLivestreamSessionRecord>;
  startSession: (
    bot: AgentLivestreamBotRecord,
  ) => Promise<AgentLivestreamSessionRecord>;
  stopSession: (
    bot: AgentLivestreamBotRecord,
  ) => Promise<AgentLivestreamSessionRecord>;
}

interface ContentGeneratorTextServiceLike {
  generateText: (params: Record<string, unknown>) => Promise<{ text?: string }>;
}

interface BatchGenerationRunnerLike {
  generateBatch: (
    params: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>;
}

interface BrandVoiceProfileDraft {
  approvedHooks: string[];
  audience: string[];
  bannedPhrases: string[];
  canonicalSource?: 'brand' | 'founder' | 'hybrid';
  doNotSoundLike: string[];
  exemplarTexts: string[];
  hashtags: string[];
  messagingPillars: string[];
  sampleOutput: string;
  style: string;
  taglines: string[];
  tone: string;
  values: string[];
  writingRules: string[];
}
@Injectable()
export class AgentToolExecutorService {
  private readonly constructorName = String(this.constructor.name);
  private readonly apiBaseUrl: string;

  constructor(
    private readonly loggerService: LoggerService,
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
    private readonly postsService: PostsService,
    @Inject('AGENT_BRANDS_SERVICE')
    private readonly brandsService: AgentBrandsServiceLike,
    @Optional()
    @Inject('AGENT_BOTS_SERVICE')
    private readonly botsService: AgentBotsServiceLike | undefined,
    @Optional()
    @Inject('AGENT_BOTS_LIVESTREAM_SERVICE')
    private readonly botsLivestreamService:
      | AgentBotsLivestreamServiceLike
      | undefined,
    private readonly campaignsService: OutreachCampaignsService,
    private readonly workflowExecutorService: WorkflowExecutorService,
    private readonly workflowsService: WorkflowsService,
    @Optional()
    private readonly workflowGenerationService:
      | WorkflowGenerationService
      | undefined,
    @Optional()
    private readonly marketplaceApiClient: MarketplaceApiClient | undefined,
    @Optional()
    private readonly marketplaceInstallService:
      | MarketplaceInstallService
      | undefined,
    private readonly trendsService: TrendsService,
    private readonly aiActionsService: AiActionsService,
    private readonly analyticsService: AnalyticsService,
    private readonly postAnalyticsService: PostAnalyticsService,
    private readonly contentGeneratorService: ContentGeneratorService,
    private readonly creditsUtilsService: CreditsUtilsService,
    @Optional()
    private readonly batchGenerationService: BatchGenerationService,
    @Optional()
    private readonly credentialsService: CredentialsService,
    @Optional()
    private readonly organizationsService: OrganizationsService,
    @Optional()
    private readonly organizationSettingsService: OrganizationSettingsService,
    @Optional()
    private readonly agentMemoryCaptureService: AgentMemoryCaptureService,
    @Optional()
    private readonly usersService: UsersService,
    @Optional()
    private readonly clerkService: ClerkService,
    @Optional()
    private readonly streamPublisher: AgentStreamPublisherService,
    @Optional()
    private readonly agentSpawnService: AgentSpawnService,
    @Optional()
    private readonly imagesService: ImagesService,
    @Optional()
    private readonly voicesService: VoicesService,
    @Optional()
    private readonly contentQualityScorerService: ContentQualityScorerService,
    @Optional()
    private readonly agentGoalsService: AgentGoalsService,
    @Optional()
    private readonly ingredientsService: IngredientsService,
    @Optional()
    private readonly votesService: VotesService,
    @Optional()
    private readonly adsResearchService: AdsResearchService | undefined,
  ) {
    this.apiBaseUrl =
      this.configService.get('API_BASE_URL') || 'http://localhost:3010';
  }

  private buildImageVariationPrompt(
    prompt: string,
    index: number,
    count: number,
    diversityMode: 'low' | 'medium' | 'high',
    styleNotes?: string,
    negativePrompt?: string,
  ): string {
    const variationHints: Record<typeof diversityMode, string> = {
      high: 'Push the concept into a clearly distinct visual take while preserving the same campaign goal.',
      low: 'Keep the concept tightly consistent with the base direction and vary only small creative details.',
      medium:
        'Vary composition, subject emphasis, and framing while staying within the same campaign direction.',
    };

    const parts = [
      prompt.trim(),
      `Create variation ${index} of ${count}.`,
      variationHints[diversityMode],
    ];

    if (styleNotes?.trim()) {
      parts.push(`Style notes: ${styleNotes.trim()}`);
    }

    if (negativePrompt?.trim()) {
      parts.push(`Avoid: ${negativePrompt.trim()}`);
    }

    return parts.join(' ');
  }

  private buildMarketplaceListingUrl(slug?: string): string | null {
    if (!slug) {
      return null;
    }

    const appUrl =
      this.configService.get('GENFEEDAI_APP_URL') || 'https://app.genfeed.ai';
    return `${appUrl.replace('app.', 'marketplace.')}/${slug}`;
  }

  private tokenizeWorkflowBootstrapText(...values: Array<unknown>): string[] {
    return values
      .flatMap((value) =>
        String(value || '')
          .toLowerCase()
          .split(/[^a-z0-9]+/g),
      )
      .map((token) => token.trim())
      .filter((token) => token.length >= 3);
  }

  private inferBootstrapContentType(
    params: Record<string, unknown>,
  ): RecurringTaskContentType {
    const explicitType =
      typeof params.contentType === 'string'
        ? params.contentType.toLowerCase()
        : null;

    if (
      explicitType === 'image' ||
      explicitType === 'video' ||
      explicitType === 'post' ||
      explicitType === 'newsletter'
    ) {
      return explicitType;
    }

    const corpus = this.tokenizeWorkflowBootstrapText(
      params.prompt,
      params.label,
      params.name,
      params.platform,
      params.description,
    ).join(' ');

    if (
      corpus.includes('newsletter') ||
      corpus.includes('article') ||
      corpus.includes('blog')
    ) {
      return 'newsletter';
    }

    if (
      corpus.includes('video') ||
      corpus.includes('reel') ||
      corpus.includes('tiktok') ||
      corpus.includes('short')
    ) {
      return 'video';
    }

    if (
      corpus.includes('image') ||
      corpus.includes('graphic') ||
      corpus.includes('visual')
    ) {
      return 'image';
    }

    return 'post';
  }

  private scoreOfficialWorkflowSource(
    source: Pick<OfficialWorkflowSource, 'description' | 'kind' | 'name'>,
    params: Record<string, unknown>,
  ): number {
    const queryTokens = this.tokenizeWorkflowBootstrapText(
      params.prompt,
      params.label,
      params.name,
      params.platform,
      params.contentType,
    );
    const haystack = this.tokenizeWorkflowBootstrapText(
      source.name,
      source.description,
    );
    const haystackSet = new Set(haystack);

    let score = source.kind === 'seeded-template' ? 100 : 50;
    for (const token of queryTokens) {
      if (haystackSet.has(token)) {
        score += 8;
      }
    }

    const contentType = this.inferBootstrapContentType(params);
    if (
      contentType === 'post' &&
      haystack.some((token) =>
        ['content', 'linkedin', 'social', 'twitter', 'post'].includes(token),
      )
    ) {
      score += 12;
    }

    if (contentType === 'video' && haystack.includes('video')) {
      score += 12;
    }

    if (contentType === 'image' && haystack.includes('image')) {
      score += 12;
    }

    if (
      contentType === 'newsletter' &&
      haystack.some((token) => ['article', 'newsletter'].includes(token))
    ) {
      score += 12;
    }

    const platform =
      typeof params.platform === 'string' ? params.platform.toLowerCase() : '';
    if (platform && haystack.includes(platform)) {
      score += 16;
    }

    return score;
  }

  private async resolveOfficialWorkflowSource(
    params: Record<string, unknown>,
  ): Promise<OfficialWorkflowSource | null> {
    const templates = await this.workflowsService.getWorkflowTemplates();
    const seededCandidates: OfficialWorkflowSource[] = templates.map(
      (template) => ({
        confidence: this.scoreOfficialWorkflowSource(
          {
            description: template.description,
            kind: 'seeded-template',
            name: template.name,
          },
          params,
        ),
        description: template.description,
        id: template.id,
        kind: 'seeded-template',
        name: template.name,
      }),
    );

    const bestSeeded = seededCandidates.sort(
      (left, right) => right.confidence - left.confidence,
    )[0];

    if (bestSeeded && bestSeeded.confidence >= 112) {
      return bestSeeded;
    }

    if (!this.marketplaceApiClient) {
      return bestSeeded && bestSeeded.confidence >= 104 ? bestSeeded : null;
    }

    const listingQuery = this.tokenizeWorkflowBootstrapText(
      params.prompt,
      params.label,
      params.name,
      params.platform,
    ).join(' ');

    const officialListings = await this.marketplaceApiClient.searchListings({
      isOfficial: true,
      limit: 12,
      search: listingQuery || undefined,
      sort: '-publishedAt',
      type: 'workflow',
    });

    const listingDocs = Array.isArray(
      (officialListings as { docs?: unknown[] }).docs,
    )
      ? (((
          officialListings as unknown as {
            docs: Array<Record<string, unknown>>;
          }
        ).docs ?? []) as Array<Record<string, unknown>>)
      : [];

    const marketplaceCandidates: OfficialWorkflowSource[] = listingDocs.map(
      (listing) => ({
        confidence: this.scoreOfficialWorkflowSource(
          {
            description:
              (listing.shortDescription as string | undefined) ||
              (listing.description as string | undefined),
            kind: 'marketplace-listing',
            name: String(listing.title || ''),
          },
          params,
        ),
        description:
          (listing.shortDescription as string | undefined) ||
          (listing.description as string | undefined),
        id: String(listing._id || ''),
        kind: 'marketplace-listing',
        name: String(listing.title || 'Official workflow'),
        price: typeof listing.price === 'number' ? listing.price : Number.NaN,
        pricingTier:
          typeof listing.pricingTier === 'string'
            ? listing.pricingTier
            : undefined,
        slug: typeof listing.slug === 'string' ? listing.slug : undefined,
      }),
    );

    const bestMarketplace = marketplaceCandidates.sort(
      (left, right) => right.confidence - left.confidence,
    )[0];

    if (bestMarketplace && bestMarketplace.confidence >= 104) {
      return bestMarketplace;
    }

    return bestSeeded && bestSeeded.confidence >= 104 ? bestSeeded : null;
  }

  private async applyInstalledWorkflowContext(
    workflowId: string,
    ctx: ToolExecutionContext,
    params: Record<string, unknown>,
    source: OfficialWorkflowSource,
  ): Promise<void> {
    const workflow = await this.workflowsService.findOne({
      _id: workflowId,
      isDeleted: false,
      organization: new Types.ObjectId(ctx.organizationId),
    });

    if (!workflow) {
      return;
    }

    const brand = await this.resolveWorkflowBrand(params, ctx);
    const schedule =
      typeof params.schedule === 'string' && params.schedule.trim()
        ? params.schedule.trim()
        : undefined;
    const timezone =
      typeof params.timezone === 'string' && params.timezone.trim()
        ? params.timezone.trim()
        : 'UTC';

    await this.workflowsService.patch(workflowId, {
      brands:
        brand && brand._id
          ? [new Types.ObjectId(String(brand._id))]
          : workflow.brands,
      label:
        typeof params.label === 'string' && params.label.trim()
          ? params.label.trim()
          : workflow.label,
      metadata: {
        ...(workflow.metadata ?? {}),
        createdFrom: 'agent',
        sourceId: source.id,
        sourceType: source.kind,
      },
      ...(schedule
        ? {
            isScheduleEnabled: true,
            schedule,
            timezone,
          }
        : {}),
    } as never);
  }

  async executeTool(
    toolName: AgentToolName,
    parameters: Record<string, unknown>,
    context: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const startTime = Date.now();

    try {
      const result = await this.dispatch(toolName, parameters, context);
      const durationMs = Date.now() - startTime;

      this.loggerService.log(
        `Tool ${toolName} executed in ${durationMs}ms`,
        this.constructorName,
      );

      return result;
    } catch (error: unknown) {
      const durationMs = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      this.loggerService.error(
        `Tool ${toolName} failed after ${durationMs}ms: ${errorMessage}`,
        this.constructorName,
      );

      return {
        creditsUsed: 0,
        error: errorMessage,
        success: false,
      };
    }
  }

  private dispatch(
    toolName: AgentToolName,
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    switch (toolName) {
      case AgentToolName.GET_CREDITS_BALANCE:
        return this.getCreditsBalance(ctx);

      case AgentToolName.LIST_BRANDS:
        return this.listBrands(ctx);

      case AgentToolName.GET_CURRENT_BRAND:
        return this.getCurrentBrand(ctx);

      case AgentToolName.LIST_POSTS:
        return this.listPosts(params, ctx);

      case AgentToolName.CREATE_POST:
        return this.createPost(params, ctx);

      case AgentToolName.SCHEDULE_POST:
        return this.schedulePost(params, ctx);

      case 'install_official_workflow' as AgentToolName:
        return this.installOfficialWorkflow(params, ctx);

      case AgentToolName.LIST_WORKFLOWS:
        return this.listWorkflows(params, ctx);

      case AgentToolName.CREATE_WORKFLOW:
        return this.createWorkflow(params, ctx);

      case CREATE_LIVESTREAM_BOT_TOOL:
        return this.createLivestreamBot(params, ctx);

      case MANAGE_LIVESTREAM_BOT_TOOL:
        return this.manageLivestreamBot(params, ctx);

      case AgentToolName.EXECUTE_WORKFLOW:
        return this.executeWorkflow(params, ctx);

      case GET_WORKFLOW_INPUTS_TOOL:
        return this.getWorkflowInputs(params, ctx);

      case AgentToolName.GET_ANALYTICS:
        return this.getAnalytics(params, ctx);

      case AgentToolName.GET_CONNECTION_STATUS:
        return this.getConnectionStatus(params, ctx);

      case AgentToolName.INITIATE_OAUTH_CONNECT:
        return this.initiateOAuthConnect(params, ctx);

      case AgentToolName.GET_TRENDS:
        return this.getTrends(params, ctx);

      case LIST_ADS_RESEARCH_TOOL:
        return this.listAdsResearch(params, ctx);

      case GET_AD_RESEARCH_DETAIL_TOOL:
        return this.getAdResearchDetail(params, ctx);

      case CREATE_AD_REMIX_WORKFLOW_TOOL:
        return this.createAdRemixWorkflow(params, ctx);

      case GENERATE_AD_PACK_TOOL:
        return this.generateAdPack(params, ctx);

      case PREPARE_AD_LAUNCH_REVIEW_TOOL:
        return this.prepareAdLaunchReview(params, ctx);

      case AgentToolName.AI_ACTION:
        return this.aiAction(params, ctx);

      case AgentToolName.GENERATE_CONTENT:
        return this.generateContent(params, ctx);

      case AgentToolName.GENERATE_IMAGE:
        return this.generateImage(params, ctx);

      case AgentToolName.REFRAME_IMAGE:
        return this.reframeImage(params, ctx);

      case AgentToolName.UPSCALE_IMAGE:
        return this.upscaleImage(params, ctx);

      case AgentToolName.GENERATE_VIDEO:
        return this.generateVideo(params, ctx);

      case AgentToolName.GENERATE_MUSIC:
        return this.generateMusic(params, ctx);

      case AgentToolName.GENERATE_VOICE:
        return this.generateVoice(params, ctx);

      case AgentToolName.OPEN_STUDIO_HANDOFF:
        return this.openStudioHandoff(params);

      case AgentToolName.GENERATE_CONTENT_BATCH:
        return this.generateContentBatch(params, ctx);

      case AgentToolName.RESOLVE_HANDLE:
        return this.resolveHandle(params, ctx);

      case AgentToolName.LIST_REVIEW_QUEUE:
        return this.listReviewQueue(params, ctx);

      case AgentToolName.BATCH_APPROVE_REJECT:
        return this.batchApproveReject(params, ctx);

      case AgentToolName.CREATE_CAMPAIGN:
        return this.createCampaign(params, ctx);

      case AgentToolName.START_CAMPAIGN:
        return this.startCampaign(params, ctx);

      case AgentToolName.PAUSE_CAMPAIGN:
        return this.pauseCampaign(params, ctx);

      case AgentToolName.COMPLETE_CAMPAIGN:
        return this.completeCampaign(params, ctx);

      case AgentToolName.GET_CAMPAIGN_ANALYTICS:
        return this.getCampaignAnalytics(params, ctx);

      // Onboarding tools
      case AgentToolName.CREATE_BRAND:
        return this.createBrand(params, ctx);

      case AgentToolName.CHECK_ONBOARDING_STATUS:
        return this.checkOnboardingStatus(ctx);

      case AgentToolName.COMPLETE_ONBOARDING:
        return this.completeOnboarding(ctx);

      case AgentToolName.CONNECT_SOCIAL_ACCOUNT:
        return this.connectSocialAccount(params, ctx);

      case AgentToolName.GENERATE_ONBOARDING_CONTENT:
        return this.generateOnboardingContent(params, ctx);

      case AgentToolName.PRESENT_PAYMENT_OPTIONS:
        return this.presentPaymentOptions(ctx);

      case AgentToolName.GENERATE_MONTHLY_CONTENT:
        return this.generateMonthlyContent(params, ctx);

      case DRAFT_BRAND_VOICE_PROFILE_TOOL:
        return this.draftBrandVoiceProfile(params, ctx);

      case SAVE_BRAND_VOICE_PROFILE_TOOL:
        return this.saveBrandVoiceProfile(params, ctx);

      // Proactive agent tools
      case AgentToolName.DISCOVER_ENGAGEMENTS:
        return this.discoverEngagements(params, ctx);

      case AgentToolName.DRAFT_ENGAGEMENT_REPLY:
        return this.draftEngagementReply(params, ctx);

      case AgentToolName.GET_APPROVAL_SUMMARY:
        return this.getApprovalSummary(ctx);

      case AgentToolName.ANALYZE_PERFORMANCE:
        return this.analyzePerformance(params, ctx);

      case AgentToolName.GET_CONTENT_CALENDAR:
        return this.getContentCalendar(params, ctx);

      case AgentToolName.UPDATE_STRATEGY_STATE:
        return this.updateStrategyState(params, ctx);

      // Identity tools
      case AgentToolName.GENERATE_AS_IDENTITY:
        return this.generateAsIdentity(params, ctx);

      // Dashboard tools
      case AgentToolName.RENDER_DASHBOARD:
        return this.renderDashboard(params, ctx);

      // Generation preparation tools
      case AgentToolName.PREPARE_GENERATION:
        return this.prepareGeneration(params);

      case AgentToolName.PREPARE_WORKFLOW_TRIGGER:
        return this.prepareWorkflowTrigger(params, ctx);

      case AgentToolName.PREPARE_VOICE_CLONE:
        return this.prepareVoiceClone(ctx);

      case AgentToolName.PREPARE_CLIP_WORKFLOW_RUN:
        return this.prepareClipWorkflowRun(params, ctx);

      case AgentToolName.SUGGEST_INGREDIENT_ALTERNATIVES:
        return this.suggestIngredientAlternatives(params);

      // Sub-agent spawning
      case AgentToolName.SPAWN_CONTENT_AGENT:
        return this.spawnContentAgent(params, ctx);

      // Ingredient picker tools
      case AgentToolName.SELECT_INGREDIENT:
        return this.selectIngredient(params, ctx);

      // Campaign coordination tools
      case AgentToolName.REQUEST_ASSET:
        return this.requestAsset(params, ctx);

      // Content quality scoring
      case 'rate_content':
        return this.rateContent(params, ctx);

      // Ingredient voting & replication tools
      case 'rate_ingredient':
        return this.rateIngredient(params, ctx);

      case 'get_top_ingredients':
        return this.getTopIngredients(params, ctx);

      case 'replicate_top_ingredient':
        return this.replicateTopIngredient(params, ctx);

      case 'capture_memory':
        return this.captureMemory(params, ctx);

      case 'create_goal':
        return this.createGoal(params, ctx);

      case 'check_goal_progress':
        return this.checkGoalProgress(params, ctx);

      case 'update_goal':
        return this.updateGoal(params, ctx);

      default:
        return {
          creditsUsed: 0,
          error: `Unknown tool: ${toolName as string}`,
          success: false,
        };
    }
  }

  // ──────────────────────────────────────────────
  // READ-ONLY TOOLS (0 credits)
  // ──────────────────────────────────────────────

  private async captureMemory(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    if (!this.agentMemoryCaptureService) {
      return {
        creditsUsed: 0,
        error: 'Memory capture is not available in this environment.',
        success: false,
      };
    }

    const content = String(params.content || '').trim();
    if (!content) {
      return {
        creditsUsed: 0,
        error: 'Memory capture requires content.',
        success: false,
      };
    }

    const brandId =
      typeof params.brandId === 'string' &&
      Types.ObjectId.isValid(params.brandId)
        ? params.brandId
        : undefined;
    const campaignId =
      typeof params.campaignId === 'string' &&
      Types.ObjectId.isValid(params.campaignId)
        ? params.campaignId
        : undefined;
    const summary =
      typeof params.summary === 'string' ? params.summary.trim() : undefined;
    const capture = await this.agentMemoryCaptureService.capture(
      ctx.userId,
      ctx.organizationId,
      {
        brandId,
        campaignId,
        confidence:
          typeof params.confidence === 'number' ? params.confidence : undefined,
        content,
        contentType:
          typeof params.contentType === 'string'
            ? params.contentType
            : undefined,
        importance:
          typeof params.importance === 'number' ? params.importance : undefined,
        kind: typeof params.kind === 'string' ? params.kind : undefined,
        performanceSnapshot:
          params.performanceSnapshot &&
          typeof params.performanceSnapshot === 'object'
            ? (params.performanceSnapshot as Record<string, unknown>)
            : undefined,
        platform:
          typeof params.platform === 'string' ? params.platform : undefined,
        saveToContextMemory: params.saveToContextMemory === true,
        scope: typeof params.scope === 'string' ? params.scope : undefined,
        sourceContentId:
          typeof params.sourceContentId === 'string'
            ? params.sourceContentId
            : undefined,
        sourceMessageId:
          typeof params.sourceMessageId === 'string'
            ? params.sourceMessageId
            : undefined,
        sourceType:
          typeof params.sourceType === 'string'
            ? params.sourceType
            : 'agent-save',
        sourceUrl:
          typeof params.sourceUrl === 'string' ? params.sourceUrl : undefined,
        summary,
        tags: Array.isArray(params.tags)
          ? params.tags.filter((tag): tag is string => typeof tag === 'string')
          : undefined,
      },
    );

    const memory = capture.memory;
    const destinations = ['agent memory'];
    if (capture.wroteContextMemory) {
      destinations.push('content memory');
    }
    if (capture.wroteBrandInsight) {
      destinations.push('brand insights');
    }

    return {
      creditsUsed: 0,
      data: {
        contentType: memory.contentType,
        destinations,
        id: String(memory._id),
        kind: memory.kind,
        scope: memory.scope,
        summary: memory.summary || summary || content.slice(0, 180),
      },
      success: true,
    };
  }

  private async createBrand(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const fallbackName = 'My Brand';
    const name = String(params.name || params.brandName || fallbackName).trim();
    const normalizedHandle = this.normalizeHandle(
      String(params.handle || ''),
      name,
    );
    const description =
      (params.description as string) ||
      (params.niche as string) ||
      `Brand profile for ${name}`;
    const voice = (params.voice as string) || 'conversational';

    const existing = await this.brandsService.findOne({
      handle: normalizedHandle,
      isDeleted: false,
      organization: new Types.ObjectId(ctx.organizationId),
    });

    if (existing) {
      return {
        creditsUsed: 0,
        data: {
          created: false,
          id: String(existing._id),
          message: 'Brand already exists for this organization.',
        },
        success: true,
      };
    }

    const brand = await this.brandsService.create({
      backgroundColor: '#000000',
      description: `${description} Voice: ${voice}.`,
      fontFamily: 'montserrat_black',
      handle: normalizedHandle,
      isSelected: false,
      label: name,
      organization: new Types.ObjectId(ctx.organizationId),
      primaryColor: '#000000',
      secondaryColor: '#FFFFFF',
      text: (params.niche as string) || undefined,
    } as never);

    const onboardingStatus = await this.checkOnboardingStatus(ctx);

    return {
      creditsUsed: 0,
      data: {
        created: true,
        handle: normalizedHandle,
        id: String(brand._id),
        name,
      },
      nextActions: onboardingStatus.nextActions,
      success: true,
    };
  }

  private async createGoal(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    if (!this.agentGoalsService) {
      return {
        creditsUsed: 0,
        error: 'Agent goals are not available in this environment.',
        success: false,
      };
    }

    const label = String(params.label || '').trim();
    const metric = String(params.metric || '').trim();
    const targetValue = Number(params.targetValue);

    if (!label || !metric || !Number.isFinite(targetValue)) {
      return {
        creditsUsed: 0,
        error: 'create_goal requires label, metric, and numeric targetValue.',
        success: false,
      };
    }

    const dto: CreateAgentGoalDto = {
      brand:
        typeof params.brandId === 'string' &&
        Types.ObjectId.isValid(params.brandId)
          ? new Types.ObjectId(params.brandId)
          : undefined,
      description:
        typeof params.description === 'string'
          ? params.description.trim()
          : undefined,
      endDate:
        typeof params.endDate === 'string'
          ? new Date(params.endDate)
          : undefined,
      isActive:
        typeof params.isActive === 'boolean' ? params.isActive : undefined,
      label,
      metric: metric as CreateAgentGoalDto['metric'],
      startDate:
        typeof params.startDate === 'string'
          ? new Date(params.startDate)
          : undefined,
      targetValue,
    };

    const goal = await this.agentGoalsService.create(
      dto,
      ctx.organizationId,
      ctx.userId,
    );

    return {
      creditsUsed: 0,
      data: {
        currentValue: goal.currentValue,
        goalId: String(goal._id),
        label: goal.label,
        metric: goal.metric,
        progressPercent: goal.progressPercent,
        targetValue: goal.targetValue,
      },
      success: true,
    };
  }

  private async checkGoalProgress(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    if (!this.agentGoalsService) {
      return {
        creditsUsed: 0,
        error: 'Agent goals are not available in this environment.',
        success: false,
      };
    }

    const goalId = String(params.goalId || '').trim();
    if (!Types.ObjectId.isValid(goalId)) {
      return {
        creditsUsed: 0,
        error: 'check_goal_progress requires a valid goalId.',
        success: false,
      };
    }

    const goal = await this.agentGoalsService.refreshProgress(
      goalId,
      ctx.organizationId,
    );

    return {
      creditsUsed: 0,
      data: {
        currentValue: goal.currentValue,
        goalId: String(goal._id),
        label: goal.label,
        metric: goal.metric,
        progressPercent: goal.progressPercent,
        targetValue: goal.targetValue,
      },
      success: true,
    };
  }

  private async updateGoal(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    if (!this.agentGoalsService) {
      return {
        creditsUsed: 0,
        error: 'Agent goals are not available in this environment.',
        success: false,
      };
    }

    const goalId = String(params.goalId || '').trim();
    if (!Types.ObjectId.isValid(goalId)) {
      return {
        creditsUsed: 0,
        error: 'update_goal requires a valid goalId.',
        success: false,
      };
    }

    const dto: UpdateAgentGoalDto = {
      description:
        typeof params.description === 'string'
          ? params.description.trim()
          : undefined,
      endDate:
        typeof params.endDate === 'string'
          ? new Date(params.endDate)
          : undefined,
      isActive:
        typeof params.isActive === 'boolean' ? params.isActive : undefined,
      label: typeof params.label === 'string' ? params.label.trim() : undefined,
      metric:
        typeof params.metric === 'string'
          ? (params.metric as UpdateAgentGoalDto['metric'])
          : undefined,
      startDate:
        typeof params.startDate === 'string'
          ? new Date(params.startDate)
          : undefined,
      targetValue:
        typeof params.targetValue === 'number' ? params.targetValue : undefined,
    };

    const goal = await this.agentGoalsService.update(
      goalId,
      dto,
      ctx.organizationId,
    );

    return {
      creditsUsed: 0,
      data: {
        currentValue: goal.currentValue,
        goalId: String(goal._id),
        label: goal.label,
        metric: goal.metric,
        progressPercent: goal.progressPercent,
        targetValue: goal.targetValue,
      },
      success: true,
    };
  }

  private async checkOnboardingStatus(
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const organizationObjectId = new Types.ObjectId(ctx.organizationId);

    const [brand, credential, firstImage, firstVideo, publishedPost, settings] =
      await Promise.all([
        this.brandsService.findOne({
          isDeleted: false,
          organization: organizationObjectId,
        }),
        this.credentialsService
          ? this.credentialsService.findOne({
              isConnected: true,
              isDeleted: false,
              organization: organizationObjectId,
            })
          : null,
        this.imagesService
          ? this.imagesService.findOne({
              isDeleted: false,
              organization: organizationObjectId,
            })
          : null,
        this.callInternalFindOne(
          '/v1/videos',
          organizationObjectId.toString(),
          ctx.authToken,
        ),
        this.postsService.findOne(
          {
            isDeleted: false,
            organization: organizationObjectId,
            status: PostStatus.PUBLIC,
          },
          [],
        ),
        this.organizationSettingsService
          ? this.organizationSettingsService.findOne({
              isDeleted: false,
              organization: organizationObjectId,
            })
          : null,
      ]);

    const normalizedMissions = this.organizationSettingsService
      ? this.organizationSettingsService.normalizeJourneyState(
          settings?.onboardingJourneyMissions as
            | IOnboardingJourneyMissionState[]
            | undefined,
        )
      : [];

    const completionMap: Record<OnboardingJourneyMissionId, boolean> = {
      complete_company_info: !!brand,
      connect_social_account: !!credential,
      generate_first_image: !!firstImage,
      generate_first_video: !!firstVideo,
      publish_first_post: !!publishedPost,
    };

    const {
      earnedCredits,
      journeyCompleted,
      missions,
      nextRecommendedMission,
    } = await this.syncOnboardingJourneyState(
      ctx,
      normalizedMissions,
      completionMap,
    );
    const completionPercent =
      missions.length > 0
        ? Math.round(
            (missions.filter((mission) => mission.isCompleted).length /
              missions.length) *
              100,
          )
        : 0;
    const creditBuckets = await this.getOnboardingCreditBuckets(
      ctx.organizationId,
      earnedCredits,
    );

    return {
      creditsUsed: 0,
      data: {
        completionPercent,
        earnedCredits,
        isComplete: journeyCompleted,
        journeyCompleted,
        journeyEarnedCredits: creditBuckets.journeyEarnedCredits,
        journeyRemainingCredits: creditBuckets.journeyRemainingCredits,
        missions,
        nextRecommendedMission,
        signupGiftCredits: creditBuckets.signupGiftCredits,
        totalOnboardingCreditsVisible:
          creditBuckets.totalOnboardingCreditsVisible,
      },
      nextActions: [this.buildOnboardingChecklistCard(missions, creditBuckets)],
      success: true,
    };
  }

  private async callInternalFindOne(
    endpoint: string,
    organizationId: string,
    authToken?: string,
  ): Promise<Record<string, unknown> | null> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.apiBaseUrl}${endpoint}`, {
          headers: authToken
            ? {
                Authorization: `Bearer ${authToken}`,
              }
            : undefined,
          params: {
            'filters[isDeleted]': false,
            'filters[organization]': organizationId,
            'pagination[pageSize]': 1,
          },
        }),
      );

      const data = response.data?.data;
      return Array.isArray(data) ? (data[0] ?? null) : (data ?? null);
    } catch {
      return null;
    }
  }

  private buildOnboardingChecklistCard(
    missions: IOnboardingJourneyMissionState[],
    creditBuckets: {
      journeyEarnedCredits: number;
      journeyRemainingCredits: number;
      signupGiftCredits: number;
      totalOnboardingCreditsVisible: number;
    },
  ): AgentUiAction {
    const nextRecommendedMissionId =
      missions.find((mission) => !mission.isCompleted)?.id ?? null;
    const completionPercent =
      missions.length > 0
        ? Math.round(
            (missions.filter((mission) => mission.isCompleted).length /
              missions.length) *
              100,
          )
        : 0;

    return {
      checklist: ONBOARDING_JOURNEY_MISSIONS.map((mission) => {
        const state = missions.find((item) => item.id === mission.id);
        return {
          ctaHref: mission.ctaHref,
          ctaLabel: mission.ctaLabel,
          description: mission.description,
          id: mission.id,
          isClaimed: state?.rewardClaimed ?? false,
          isCompleted: state?.isCompleted ?? false,
          isRecommended: mission.id === nextRecommendedMissionId,
          label: mission.label,
          rewardCredits: mission.rewardCredits,
        };
      }),
      completionPercent,
      description:
        creditBuckets.signupGiftCredits > 0
          ? `Your signup gift is live. Unlock ${creditBuckets.journeyRemainingCredits} more Gen credits as you finish setup.`
          : 'Unlock more Gen credits by completing the setup missions that make your content better.',
      earnedCredits: creditBuckets.journeyEarnedCredits,
      id: `onboarding-journey-${Date.now()}`,
      journeyEarnedCredits: creditBuckets.journeyEarnedCredits,
      journeyRemainingCredits: creditBuckets.journeyRemainingCredits,
      signupGiftCredits: creditBuckets.signupGiftCredits,
      title: 'Activation Journey',
      totalJourneyCredits: ONBOARDING_JOURNEY_TOTAL_CREDITS,
      totalOnboardingCreditsVisible:
        creditBuckets.totalOnboardingCreditsVisible,
      type: 'onboarding_checklist_card',
    };
  }

  private async getOnboardingCreditBuckets(
    organizationId: string,
    earnedCredits: number,
  ): Promise<{
    signupGiftCredits: number;
    journeyEarnedCredits: number;
    journeyRemainingCredits: number;
    totalOnboardingCreditsVisible: number;
  }> {
    const credits =
      await this.creditsUtilsService.getOrganizationCreditsWithExpiration(
        organizationId,
      );
    const signupGiftCredits = credits.credits.reduce((total, entry) => {
      if (entry.source !== 'onboarding-signup-gift') {
        return total;
      }

      return total + entry.balance;
    }, 0);

    return {
      journeyEarnedCredits: earnedCredits,
      journeyRemainingCredits: Math.max(
        ONBOARDING_JOURNEY_TOTAL_CREDITS - earnedCredits,
        0,
      ),
      signupGiftCredits,
      totalOnboardingCreditsVisible:
        signupGiftCredits + ONBOARDING_JOURNEY_TOTAL_CREDITS,
    };
  }

  private async completeJourneyMission(
    ctx: ToolExecutionContext,
    missionId: OnboardingJourneyMissionId,
  ): Promise<void> {
    if (!this.organizationSettingsService) {
      return;
    }

    const settings = await this.organizationSettingsService.findOne({
      isDeleted: false,
      organization: new Types.ObjectId(ctx.organizationId),
    });

    if (!settings?._id) {
      return;
    }

    const missions = this.organizationSettingsService.normalizeJourneyState(
      settings.onboardingJourneyMissions as
        | IOnboardingJourneyMissionState[]
        | undefined,
    );
    const mission = missions.find((item) => item.id === missionId);

    if (!mission || mission.rewardClaimed) {
      return;
    }

    const updatedMissions = missions.map((item) =>
      item.id === missionId
        ? {
            ...item,
            completedAt: item.completedAt ?? new Date(),
            isCompleted: true,
            rewardClaimed: true,
          }
        : item,
    );

    await this.organizationSettingsService.patch(String(settings._id), {
      onboardingJourneyMissions: updatedMissions,
    });

    await this.creditsUtilsService.addOrganizationCreditsWithExpiration(
      ctx.organizationId,
      mission.rewardCredits,
      'onboarding-journey',
      `Onboarding journey reward: ${missionId}`,
      new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    );
  }

  private async syncOnboardingJourneyState(
    ctx: ToolExecutionContext,
    missions: IOnboardingJourneyMissionState[],
    completionMap: Record<OnboardingJourneyMissionId, boolean>,
  ): Promise<{
    missions: IOnboardingJourneyMissionState[];
    earnedCredits: number;
    journeyCompleted: boolean;
    nextRecommendedMission: OnboardingJourneyMissionId | null;
  }> {
    if (!this.organizationSettingsService) {
      return {
        earnedCredits: 0,
        journeyCompleted: false,
        missions,
        nextRecommendedMission: null,
      };
    }

    const nextMissions = missions.map((mission) => {
      const shouldComplete = completionMap[mission.id];
      return shouldComplete && !mission.isCompleted
        ? { ...mission, completedAt: new Date(), isCompleted: true }
        : mission;
    });

    let totalRewardCreditsGranted = 0;
    const claimedMissions = nextMissions.map((mission) => {
      if (mission.isCompleted && !mission.rewardClaimed) {
        totalRewardCreditsGranted += mission.rewardCredits;
        return { ...mission, rewardClaimed: true };
      }

      return mission;
    });

    const earnedCredits = claimedMissions
      .filter((mission) => mission.rewardClaimed)
      .reduce((total, mission) => total + mission.rewardCredits, 0);
    const journeyCompleted = claimedMissions.every(
      (mission) => mission.isCompleted,
    );
    const currentSettings = await this.organizationSettingsService.findOne({
      isDeleted: false,
      organization: new Types.ObjectId(ctx.organizationId),
    });

    if (currentSettings?._id) {
      await this.organizationSettingsService.patch(
        String(currentSettings._id),
        {
          onboardingJourneyCompletedAt: journeyCompleted
            ? currentSettings.onboardingJourneyCompletedAt || new Date()
            : null,
          onboardingJourneyMissions: claimedMissions,
        },
      );
    }

    if (totalRewardCreditsGranted > 0) {
      await this.creditsUtilsService.addOrganizationCreditsWithExpiration(
        ctx.organizationId,
        totalRewardCreditsGranted,
        'onboarding-journey',
        'Onboarding journey reward',
        new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      );
    }

    if (journeyCompleted) {
      if (this.organizationsService) {
        await this.organizationsService.patch(ctx.organizationId, {
          onboardingCompleted: true,
        });
      }

      if (this.usersService) {
        const dbUser = await this.usersService.findOne({
          clerkId: ctx.userId,
          isDeleted: false,
        });

        if (dbUser?._id) {
          await this.usersService.patch(dbUser._id, {
            isOnboardingCompleted: true,
            onboardingCompletedAt: new Date(),
            onboardingStepsCompleted: ['brand', 'plan'],
          });
        }
      }

      if (this.clerkService) {
        await this.clerkService.updateUserPublicMetadata(ctx.userId, {
          isOnboardingCompleted: true,
        });
      }
    }

    return {
      earnedCredits,
      journeyCompleted,
      missions: claimedMissions,
      nextRecommendedMission:
        this.organizationSettingsService.getNextRecommendedJourneyMission(
          claimedMissions,
        ),
    };
  }

  private async completeOnboarding(
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    if (this.organizationsService) {
      await this.organizationsService.patch(ctx.organizationId, {
        onboardingCompleted: true,
      });
    }

    let dbUserId: string | null = null;
    if (this.usersService) {
      const dbUser = await this.usersService.findOne({
        clerkId: ctx.userId,
        isDeleted: false,
      });

      if (dbUser) {
        dbUserId = String(dbUser._id);
        await this.usersService.patch(dbUser._id, {
          isOnboardingCompleted: true,
          onboardingCompletedAt: new Date(),
          onboardingStepsCompleted: ['brand', 'plan'],
        });
      }
    }

    if (this.clerkService) {
      await this.clerkService.updateUserPublicMetadata(ctx.userId, {
        isOnboardingCompleted: true,
      });
    }

    return {
      creditsUsed: 0,
      data: {
        onboardingCompleted: true,
        organizationId: ctx.organizationId,
        userId: dbUserId ?? ctx.userId,
      },
      success: true,
    };
  }

  /**
   * Returns a UI action card prompting the user to connect a social account via OAuth.
   * The frontend renders this as a clickable card that opens the OAuth popup.
   */
  private connectSocialAccount(
    params: Record<string, unknown>,
    _ctx: ToolExecutionContext,
  ): AgentToolResult {
    const platform = params.platform as string;

    return {
      creditsUsed: 0,
      data: {
        message: `Please connect your ${platform} account using the button below.`,
        uiAction: {
          platform,
          type: 'oauth_connect_card',
        },
      },
      success: true,
    };
  }

  /**
   * Generates sample onboarding content (3 tweets + 3 images) using cheap models.
   * Credits are deducted from the user's balance via the internal API endpoints
   * (CreditsInterceptor), including any onboarding journey credits already earned.
   * Uses brand voice/style from scraping for personalized content.
   */
  private async generateOnboardingContent(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const brandId = params.brandId as string;
    const brandName = (params.brandName as string) || 'your brand';
    const brandDescription = (params.brandDescription as string) || '';

    try {
      // Generate 3 tweets using brand context
      const tweetTopics = [
        `Engaging tweet about ${brandName}'s value proposition${brandDescription ? `: ${brandDescription}` : ''}`,
        `Behind-the-scenes or authentic story tweet for ${brandName}`,
        `Call-to-action or community engagement tweet for ${brandName}`,
      ];

      const tweets: string[] = [];
      for (let i = 0; i < tweetTopics.length; i++) {
        const topic = tweetTopics[i];
        await runEffectPromise(
          this.publishToolProgressEffect({
            message: `Generating tweet ${i + 1}/3...`,
            progress: i / 6,
            threadId: ctx.threadId ?? `onboarding-${brandId}`,
            toolName: 'generate_onboarding_content',
            userId: ctx.userId,
          }).pipe(Effect.catchAll(() => Effect.void)),
        );
        const result = await (
          this
            .contentGeneratorService as unknown as ContentGeneratorTextServiceLike
        ).generateText({
          brandId,
          organizationId: ctx.organizationId,
          platform: 'twitter',
          topic,
          type: 'post',
        });
        tweets.push(result.text || '');
      }

      // Generate 3 images sequentially using brand-aware prompts
      const imagePrompts = [
        `Professional brand lifestyle photo for ${brandName}, social media ready, high quality`,
        `Clean product or service showcase for ${brandName}, modern aesthetic`,
        `Engaging visual content for ${brandName} social media campaign`,
      ];

      const imageResults: PromiseSettledResult<AgentToolResult>[] = [];
      for (let i = 0; i < imagePrompts.length; i++) {
        await runEffectPromise(
          this.publishToolProgressEffect({
            message: `Generating image ${i + 1}/3...`,
            progress: (3 + i) / 6,
            threadId: ctx.threadId ?? `onboarding-${brandId}`,
            toolName: 'generate_onboarding_content',
            userId: ctx.userId,
          }).pipe(Effect.catchAll(() => Effect.void)),
        );
        imageResults.push(
          await this.generateImage(
            { aspectRatio: '1:1', prompt: imagePrompts[i] },
            ctx,
          ).then(
            (value) => ({ status: 'fulfilled' as const, value }),
            (reason: unknown) => ({ reason, status: 'rejected' as const }),
          ),
        );
      }

      const images: string[] = imageResults
        .filter(
          (r): r is PromiseFulfilledResult<AgentToolResult> =>
            r.status === 'fulfilled' && r.value.success && !!r.value.data?.url,
        )
        .map((r) => r.value.data?.url as string);

      return {
        creditsUsed: 0,
        data: {
          images,
          message: `Generated ${tweets.length} tweets and ${images.length} images for ${brandName}.`,
          tweets,
        },
        nextActions: [
          {
            ctas: [{ href: '/posts/drafts', label: 'View all drafts' }],
            description: `Sample content generated for ${brandName}`,
            id: `onboarding-content-${Date.now()}`,
            images,
            title: `${tweets.length} tweets + ${images.length} images generated`,
            tweets,
            type: 'content_preview_card',
          },
        ],
        success: true,
      };
    } catch (error: unknown) {
      this.loggerService.error('generateOnboardingContent failed', error);
      return {
        creditsUsed: 0,
        error: 'Failed to generate sample content',
        success: false,
      };
    }
  }

  /**
   * Returns a UI action card with payment/credit pack options.
   * Includes a free tier skip path for users not ready to pay.
   */
  private presentPaymentOptions(_ctx: ToolExecutionContext): AgentToolResult {
    const billingHref = isEEEnabled()
      ? '/settings/organization/billing'
      : '/settings/organization/api-keys';
    const billingLabel = isEEEnabled()
      ? 'View all plans'
      : 'Configure providers';

    return {
      creditsUsed: 0,
      data: {
        canSkip: true,
        message: isEEEnabled()
          ? 'Choose a credit pack to unlock video generation, monthly content calendars, and more.'
          : 'Configure provider API keys to unlock generation, workflows, and publishing in your local install.',
      },
      nextActions: [
        {
          ctas: [
            {
              href: billingHref,
              label: billingLabel,
            },
          ],
          id: `payment-cta-${Date.now()}`,
          packs: [
            {
              credits: 100,
              label: 'Starter',
              price: '$9',
            },
            {
              credits: 500,
              label: 'Creator',
              price: '$29',
            },
            {
              credits: 2000,
              label: 'Pro',
              price: '$79',
            },
          ],
          title: 'Unlock credits to publish & generate more',
          type: 'payment_cta_card',
        },
      ],
      success: true,
    };
  }

  /**
   * Generates a full month of content using the batch generation system.
   */
  private async generateMonthlyContent(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const brandId = params.brandId as string;
    const platforms = (params.platforms as string[]) || ['twitter'];

    if (!this.batchGenerationService) {
      return {
        creditsUsed: 0,
        error: 'Batch generation service not available',
        success: false,
      };
    }

    try {
      const now = new Date();
      const endDate = new Date(now);
      endDate.setDate(endDate.getDate() + 30);

      const batchResult = await (
        this.batchGenerationService as unknown as BatchGenerationRunnerLike
      ).generateBatch({
        brandId,
        contentMix: {
          carouselPercent: 0,
          imagePercent: 30,
          reelPercent: 0,
          storyPercent: 0,
          videoPercent: 10,
        },
        count: 30,
        dateRange: {
          end: endDate.toISOString().split('T')[0],
          start: now.toISOString().split('T')[0],
        },
        organizationId: ctx.organizationId,
        platforms,
        userId: ctx.userId,
      });

      return {
        creditsUsed: 5,
        data: {
          batchId: batchResult.batchId,
          itemCount: batchResult.itemCount,
          message: `Created a 30-day content calendar with ${batchResult.itemCount} items. Review them in the Calendar or Review page.`,
        },
        nextActions: [
          {
            ctas: [
              { href: '/calendar/posts', label: 'View Calendar' },
              { href: '/review', label: 'Review Queue' },
            ],
            description: `${batchResult.itemCount} content items scheduled over the next 30 days`,
            id: `calendar-gen-${batchResult.batchId}`,
            title: '30-day content calendar created',
            type: 'content_preview_card',
          },
        ],
        success: true,
      };
    } catch (error: unknown) {
      this.loggerService.error('generateMonthlyContent failed', error);
      return {
        creditsUsed: 0,
        error: 'Failed to generate monthly content',
        success: false,
      };
    }
  }

  private normalizeStringList(value: unknown): string[] {
    if (Array.isArray(value)) {
      return value
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean);
    }

    if (typeof value === 'string') {
      return value
        .split(/\n|,/)
        .map((item) => item.trim())
        .filter(Boolean);
    }

    return [];
  }

  private async resolveTargetBrand(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<Record<string, unknown> | null> {
    const explicitBrandId =
      typeof params.brandId === 'string' &&
      Types.ObjectId.isValid(params.brandId)
        ? params.brandId
        : typeof ctx.brandId === 'string' && Types.ObjectId.isValid(ctx.brandId)
          ? ctx.brandId
          : null;

    if (explicitBrandId) {
      return this.brandsService.findOne({
        _id: new Types.ObjectId(explicitBrandId),
        isDeleted: false,
        organization: new Types.ObjectId(ctx.organizationId),
      });
    }

    return this.brandsService.findOne({
      isDeleted: false,
      organization: new Types.ObjectId(ctx.organizationId),
    });
  }

  private formatBrandVoiceProfile(profile: BrandVoiceProfileDraft): string {
    const sections = [
      `Tone: ${profile.tone || 'Not set'}`,
      `Style: ${profile.style || 'Not set'}`,
      `Audience: ${profile.audience.join(', ') || 'Not set'}`,
      `Messaging pillars: ${profile.messagingPillars.join(', ') || 'Not set'}`,
      `Core values: ${profile.values.join(', ') || 'Not set'}`,
      `Avoid: ${profile.doNotSoundLike.join(', ') || 'Not set'}`,
      `Taglines: ${profile.taglines.join(', ') || 'Not set'}`,
      `Hashtags: ${profile.hashtags.join(', ') || 'Not set'}`,
      `Sample output:\n${profile.sampleOutput || 'Not set'}`,
    ];

    return sections.join('\n\n');
  }

  private async draftBrandVoiceProfile(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    if (!this.brandsService.generateBrandVoice) {
      return {
        creditsUsed: 0,
        error: 'Brand voice generation is not available in this environment.',
        success: false,
      };
    }

    const brand = await this.resolveTargetBrand(params, ctx);
    if (!brand?._id) {
      return {
        creditsUsed: 0,
        error: 'Create or select a brand before drafting brand voice.',
        success: false,
      };
    }

    const profile = await this.brandsService.generateBrandVoice(
      {
        brandId: String(brand._id),
        examplesToAvoid: this.normalizeStringList(params.examplesToAvoid),
        examplesToEmulate: this.normalizeStringList(params.examplesToEmulate),
        industry:
          typeof params.industry === 'string'
            ? params.industry.trim()
            : undefined,
        offering:
          typeof params.offering === 'string'
            ? params.offering.trim()
            : undefined,
        targetAudience:
          typeof params.targetAudience === 'string'
            ? params.targetAudience.trim()
            : undefined,
        url: typeof params.url === 'string' ? params.url.trim() : undefined,
      },
      ctx.organizationId,
    );

    return {
      creditsUsed: 0,
      data: {
        brandId: String(brand._id),
        brandName:
          typeof brand.label === 'string' && brand.label.trim()
            ? brand.label.trim()
            : 'Selected brand',
        voiceProfile: profile,
      },
      nextActions: [
        {
          brandId: String(brand._id),
          ctas: [
            {
              action: 'confirm_save_brand_voice_profile',
              label: 'Approve and save',
              payload: {
                brandId: String(brand._id),
                voiceProfile: profile,
              },
            },
          ],
          data: { voiceProfile: profile },
          description:
            'Review this draft. Ask for changes in chat, or approve to save it to the brand.',
          id: `brand-voice-profile-${String(brand._id)}`,
          textContent: this.formatBrandVoiceProfile(profile),
          title: 'Brand Voice Draft',
          type: 'brand_voice_profile_card',
        } as never,
      ],
      success: true,
    };
  }

  private async saveBrandVoiceProfile(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    if (!this.brandsService.updateAgentConfig) {
      return {
        creditsUsed: 0,
        error: 'Brand config updates are not available in this environment.',
        success: false,
      };
    }

    const brand = await this.resolveTargetBrand(params, ctx);
    if (!brand?._id) {
      return {
        creditsUsed: 0,
        error: 'Create or select a brand before saving brand voice.',
        success: false,
      };
    }

    const rawProfile =
      params.voiceProfile && typeof params.voiceProfile === 'object'
        ? (params.voiceProfile as Record<string, unknown>)
        : null;

    if (!rawProfile) {
      return {
        creditsUsed: 0,
        error: 'save_brand_voice_profile requires a voiceProfile payload.',
        success: false,
      };
    }

    const profile: BrandVoiceProfileDraft = {
      approvedHooks: this.normalizeStringList(rawProfile.approvedHooks),
      audience: this.normalizeStringList(rawProfile.audience),
      bannedPhrases: this.normalizeStringList(rawProfile.bannedPhrases),
      canonicalSource:
        rawProfile.canonicalSource === 'brand' ||
        rawProfile.canonicalSource === 'founder' ||
        rawProfile.canonicalSource === 'hybrid'
          ? rawProfile.canonicalSource
          : undefined,
      doNotSoundLike: this.normalizeStringList(rawProfile.doNotSoundLike),
      exemplarTexts: this.normalizeStringList(rawProfile.exemplarTexts),
      hashtags: this.normalizeStringList(rawProfile.hashtags),
      messagingPillars: this.normalizeStringList(rawProfile.messagingPillars),
      sampleOutput:
        typeof rawProfile.sampleOutput === 'string'
          ? rawProfile.sampleOutput.trim()
          : '',
      style:
        typeof rawProfile.style === 'string' ? rawProfile.style.trim() : '',
      taglines: this.normalizeStringList(rawProfile.taglines),
      tone: typeof rawProfile.tone === 'string' ? rawProfile.tone.trim() : '',
      values: this.normalizeStringList(rawProfile.values),
      writingRules: this.normalizeStringList(rawProfile.writingRules),
    };

    await this.brandsService.updateAgentConfig(
      String(brand._id),
      ctx.organizationId,
      {
        voice: {
          approvedHooks: profile.approvedHooks,
          audience: profile.audience,
          bannedPhrases: profile.bannedPhrases,
          canonicalSource: profile.canonicalSource,
          doNotSoundLike: profile.doNotSoundLike,
          exemplarTexts: profile.exemplarTexts,
          hashtags: profile.hashtags,
          messagingPillars: profile.messagingPillars,
          sampleOutput: profile.sampleOutput,
          style: profile.style,
          taglines: profile.taglines,
          tone: profile.tone,
          values: profile.values,
          writingRules: profile.writingRules,
        },
      },
    );

    return {
      creditsUsed: 0,
      data: {
        brandId: String(brand._id),
        saved: true,
        voiceProfile: profile,
      },
      success: true,
    };
  }

  private async getCreditsBalance(
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const balance =
      await this.creditsUtilsService.getOrganizationCreditsBalance(
        ctx.organizationId,
      );

    return {
      creditsUsed: 0,
      data: { balance },
      success: true,
    };
  }

  private async listBrands(
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const brands = await this.brandsService.findAll(
      [
        {
          $match: {
            isDeleted: false,
            organization: new Types.ObjectId(ctx.organizationId),
          },
        },
        { $limit: 50 },
        {
          $project: {
            _id: 1,
            description: 1,
            handle: 1,
            isActive: 1,
            label: 1,
            name: 1,
            text: 1,
          },
        },
      ],
      {},
    );

    return {
      creditsUsed: 0,
      data: {
        brands: serializeAgentBrands(
          (brands.docs as Record<string, unknown>[] | undefined) ?? [],
        ),
      },
      success: true,
    };
  }

  private async getCurrentBrand(
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const currentBrand = await this.brandsService.findOne({
      isDeleted: false,
      isSelected: true,
      organization: new Types.ObjectId(ctx.organizationId),
      user: new Types.ObjectId(ctx.userId),
    } as never);

    if (!currentBrand) {
      return {
        creditsUsed: 0,
        error: 'No brand is currently selected. Please select a brand first.',
        success: false,
      };
    }

    return {
      creditsUsed: 0,
      data: {
        currentBrand: serializeAgentBrand(
          currentBrand as unknown as Record<string, unknown>,
        ),
      },
      success: true,
    };
  }

  private async resolveWorkflowBrand(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<Record<string, unknown> | null> {
    if (
      typeof params.brandId === 'string' &&
      Types.ObjectId.isValid(params.brandId)
    ) {
      const explicitBrand = await this.brandsService.findOne({
        _id: new Types.ObjectId(params.brandId),
        isDeleted: false,
        organization: new Types.ObjectId(ctx.organizationId),
      });

      if (explicitBrand) {
        return explicitBrand as unknown as Record<string, unknown>;
      }
    }

    const currentBrand = await this.brandsService.findOne({
      isDeleted: false,
      isSelected: true,
      organization: new Types.ObjectId(ctx.organizationId),
      user: new Types.ObjectId(ctx.userId),
    });

    if (currentBrand) {
      return currentBrand as unknown as Record<string, unknown>;
    }

    if (!this.usersService || !this.clerkService) {
      return null;
    }

    const user = await this.usersService.findOne({
      _id: new Types.ObjectId(ctx.userId),
      isDeleted: false,
    });

    if (!user?.clerkId) {
      return null;
    }

    const clerkUser = await this.clerkService.getUser(user.clerkId);
    const fallbackBrandId = clerkUser.publicMetadata?.brand;

    if (
      typeof fallbackBrandId !== 'string' ||
      !Types.ObjectId.isValid(fallbackBrandId)
    ) {
      return null;
    }

    const fallbackBrand = await this.brandsService.findOne({
      _id: new Types.ObjectId(fallbackBrandId),
      isDeleted: false,
      organization: new Types.ObjectId(ctx.organizationId),
    });

    return fallbackBrand as unknown as Record<string, unknown> | null;
  }

  private buildWorkflowCreatedResult(params: {
    creditsUsed: number;
    description: string;
    nextRunAt?: Date | null;
    schedule?: string;
    scheduleSummary?: string;
    successDescription: string;
    timezone?: string;
    workflowId: string;
    workflowLabel: string;
    extraData?: Record<string, unknown>;
  }): AgentToolResult {
    return {
      creditsUsed: params.creditsUsed,
      data: {
        editorUrl: `/automations/editor/${params.workflowId}`,
        id: params.workflowId,
        label: params.workflowLabel,
        nextRunAt: params.nextRunAt ?? null,
        schedule: params.schedule ?? null,
        timezone: params.schedule && params.timezone ? params.timezone : null,
        ...(params.extraData ?? {}),
      },
      nextActions: [
        {
          ctas: [
            {
              href: `/automations/editor/${params.workflowId}`,
              label: 'Open workflow',
            },
            {
              href: '/automations/executions',
              label: 'Open executions',
            },
          ],
          description: params.successDescription,
          id: `workflow-created-${params.workflowId}`,
          nextRunAt: params.nextRunAt?.toISOString(),
          scheduleSummary: params.scheduleSummary,
          title: 'Automation created',
          type: 'workflow_created_card' as const,
          workflowDescription: params.description,
          workflowId: params.workflowId,
          workflowName: params.workflowLabel,
        },
      ],
      success: true,
    };
  }

  private normalizeLivestreamBotPlatform(
    platform: unknown,
  ): LivestreamBotPlatform | null {
    return platform === 'youtube' || platform === 'twitch' ? platform : null;
  }

  private toBotPlatform(platform: LivestreamBotPlatform): BotPlatform {
    return platform === 'youtube' ? BotPlatform.YOUTUBE : BotPlatform.TWITCH;
  }

  private getLivestreamBotPageHref(platform: LivestreamBotPlatform): string {
    return platform === 'youtube'
      ? '/agents/bots/youtube-chat'
      : '/agents/bots/twitch-chat';
  }

  private buildDefaultLivestreamSettings(params: {
    contextTemplate?: string;
    hostPromptTemplate?: string;
    linkLabel?: string;
    linkUrl?: string;
    maxAutoPostsPerHour?: number;
    minimumMessageGapSeconds?: number;
    platform: LivestreamBotPlatform;
    scheduledCadenceMinutes?: number;
    transcriptEnabled?: boolean;
  }): Record<string, unknown> {
    const platform = this.toBotPlatform(params.platform);
    const linkUrl = params.linkUrl?.trim();
    const linkLabel = params.linkLabel?.trim();
    const contextTemplate =
      params.contextTemplate?.trim() ||
      'What is your take on {{topic}} right now?';
    const hostPromptTemplate =
      params.hostPromptTemplate?.trim() ||
      'Hosts, what should the audience build with this tonight?';

    return {
      automaticPosting: true,
      links: linkUrl
        ? [
            {
              id: 'primary-link',
              label: linkLabel || 'Show Notes',
              url: linkUrl,
            },
          ]
        : [],
      manualOverrideTtlMinutes: 15,
      maxAutoPostsPerHour: params.maxAutoPostsPerHour ?? 6,
      messageTemplates: [
        {
          enabled: true,
          id: 'scheduled-link',
          platforms: [platform],
          text: '{{link_label}}: {{link_url}}',
          type: 'scheduled_link_drop',
        },
        {
          enabled: true,
          id: 'scheduled-host-prompt',
          platforms: [platform],
          text: hostPromptTemplate,
          type: 'scheduled_host_prompt',
        },
        {
          enabled: true,
          id: 'context-aware-question',
          platforms: [platform],
          text: contextTemplate,
          type: 'context_aware_question',
        },
      ],
      minimumMessageGapSeconds: params.minimumMessageGapSeconds ?? 90,
      prioritizeYoutube: true,
      scheduledCadenceMinutes: params.scheduledCadenceMinutes ?? 10,
      targetAudience: ['hosts', 'audience'],
      transcriptEnabled: params.transcriptEnabled ?? true,
      transcriptLookbackMinutes: 3,
    };
  }

  private buildLivestreamBotCreatedResult(params: {
    bot: AgentLivestreamBotRecord;
    brandId: string;
    creditsUsed: number;
    organizationId: string;
    platform: LivestreamBotPlatform;
    session: AgentLivestreamSessionRecord;
  }): AgentToolResult {
    const botId = String(params.bot._id);
    const openHref = this.getLivestreamBotPageHref(params.platform);

    return {
      creditsUsed: params.creditsUsed,
      data: {
        botId,
        botName: params.bot.label,
        brandId: params.brandId,
        openUrl: openHref,
        organizationId: params.organizationId,
        platform: params.platform,
        sessionStatus: params.session.status,
      },
      nextActions: [
        {
          botId,
          botName: params.bot.label,
          brandId: params.brandId,
          ctas: [
            {
              href: openHref,
              label: 'Open bot',
            },
            {
              action: MANAGE_LIVESTREAM_BOT_TOOL,
              label: 'Start session',
              payload: {
                action: 'start_session',
                botId,
              },
            },
            {
              action: MANAGE_LIVESTREAM_BOT_TOOL,
              label: 'Send message now',
              payload: {
                action: 'send_now',
                botId,
                platform: params.platform,
              },
            },
          ],
          description: 'Livestream chat bot created and ready for control.',
          id: `bot-created-${botId}`,
          platform: params.platform,
          sessionStatus: params.session.status,
          title: 'Livestream bot created',
          type: 'bot_created_card' as const,
        },
      ],
      success: true,
    };
  }

  private buildLivestreamBotStatusResult(params: {
    bot: AgentLivestreamBotRecord;
    creditsUsed: number;
    platform: LivestreamBotPlatform;
    session: AgentLivestreamSessionRecord;
    statusDescription: string;
  }): AgentToolResult {
    const botId = String(params.bot._id);
    const openHref = this.getLivestreamBotPageHref(params.platform);
    const nextControlCta =
      params.session.status === 'active'
        ? {
            action: MANAGE_LIVESTREAM_BOT_TOOL,
            label: 'Pause session',
            payload: {
              action: 'pause_session',
              botId,
            },
          }
        : params.session.status === 'paused'
          ? {
              action: MANAGE_LIVESTREAM_BOT_TOOL,
              label: 'Resume session',
              payload: {
                action: 'resume_session',
                botId,
              },
            }
          : {
              action: MANAGE_LIVESTREAM_BOT_TOOL,
              label: 'Start session',
              payload: {
                action: 'start_session',
                botId,
              },
            };

    return {
      creditsUsed: params.creditsUsed,
      data: {
        botId,
        botName: params.bot.label,
        openUrl: openHref,
        platform: params.platform,
        sessionStatus: params.session.status,
      },
      nextActions: [
        {
          botId,
          botName: params.bot.label,
          ctas: [
            {
              href: openHref,
              label: 'Open bot',
            },
            nextControlCta,
            {
              action: MANAGE_LIVESTREAM_BOT_TOOL,
              label: 'Stop session',
              payload: {
                action: 'stop_session',
                botId,
              },
            },
            {
              action: MANAGE_LIVESTREAM_BOT_TOOL,
              label: 'Send message now',
              payload: {
                action: 'send_now',
                botId,
                platform: params.platform,
              },
            },
          ],
          data: {
            context: params.session.context,
            deliveryHistory: params.session.deliveryHistory ?? [],
            platformStates: params.session.platformStates ?? [],
          },
          description: params.statusDescription,
          id: `livestream-bot-status-${botId}`,
          platform: params.platform,
          sessionStatus: params.session.status,
          title: 'Livestream bot status',
          type: 'livestream_bot_status_card' as const,
        },
      ],
      success: true,
    };
  }

  private isLivestreamBot(bot: AgentLivestreamBotRecord): boolean {
    if (
      bot.category === LIVESTREAM_BOT_CATEGORY ||
      bot.category === BotCategory.LIVESTREAM_CHAT
    ) {
      return true;
    }

    return (bot.platforms ?? []).some(
      (platform) =>
        platform === BotPlatform.YOUTUBE || platform === BotPlatform.TWITCH,
    );
  }

  private inferLivestreamBotPlatform(
    bot: AgentLivestreamBotRecord,
    requestedPlatform?: LivestreamBotPlatform | null,
  ): LivestreamBotPlatform {
    if (requestedPlatform) {
      return requestedPlatform;
    }

    const target = (bot.targets ?? []).find(
      (candidate) =>
        candidate.platform === BotPlatform.YOUTUBE ||
        candidate.platform === BotPlatform.TWITCH,
    );

    if (target?.platform === BotPlatform.YOUTUBE) {
      return 'youtube';
    }

    return 'twitch';
  }

  private async findLivestreamBotForManagement(
    botId: string,
    ctx: ToolExecutionContext,
  ): Promise<{
    bot: AgentLivestreamBotRecord;
    platform: LivestreamBotPlatform;
    session: AgentLivestreamSessionRecord;
  } | null> {
    if (!this.botsService || !this.botsLivestreamService) {
      return null;
    }

    if (!Types.ObjectId.isValid(botId)) {
      return null;
    }

    const bot = await this.botsService.findOne({
      _id: new Types.ObjectId(botId),
      isDeleted: false,
      organization: new Types.ObjectId(ctx.organizationId),
    });

    if (!bot || !this.isLivestreamBot(bot)) {
      return null;
    }

    const brand = await this.resolveWorkflowBrand({}, ctx);
    if (bot.brand && (!brand || String(bot.brand) !== String(brand._id))) {
      return null;
    }

    const session = await this.botsLivestreamService.getOrCreateSession(bot);

    return {
      bot,
      platform: this.inferLivestreamBotPlatform(bot),
      session,
    };
  }

  private async listPosts(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const limit = (params.limit as number) || 10;
    const matchStage: Record<string, unknown> = {
      isDeleted: false,
      organization: new Types.ObjectId(ctx.organizationId),
    };

    if (params.status) {
      matchStage.status = params.status;
    }

    const posts = await this.postsService.findAll(
      [
        { $match: matchStage },
        { $sort: { createdAt: -1 } },
        { $limit: limit },
        {
          $project: {
            _id: 1,
            createdAt: 1,
            description: { $substr: ['$description', 0, 200] },
            label: 1,
            platform: 1,
            scheduledDate: 1,
            status: 1,
          },
        },
      ],
      {},
    );

    return {
      creditsUsed: 0,
      data: {
        count: posts.docs?.length ?? 0,
        posts:
          posts.docs?.map((p) => {
            const post = p as unknown as Record<string, unknown>;
            return {
              createdAt: post.createdAt,
              description: post.description,
              id: String(post._id),
              label: post.label,
              platform: post.platform,
              scheduledDate: post.scheduledDate,
              status: post.status,
            };
          }) ?? [],
      },
      success: true,
    };
  }

  private async listWorkflows(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const limit = (params.limit as number) || 10;

    const workflows = await this.workflowsService.findAll(
      [
        {
          $match: {
            isDeleted: false,
            organization: new Types.ObjectId(ctx.organizationId),
          },
        },
        { $sort: { updatedAt: -1 } },
        { $limit: limit },
        {
          $project: {
            _id: 1,
            createdAt: 1,
            description: 1,
            name: 1,
            status: 1,
            updatedAt: 1,
          },
        },
      ],
      {},
    );

    return {
      creditsUsed: 0,
      data: {
        count: workflows.docs?.length ?? 0,
        workflows:
          workflows.docs?.map((w) => {
            const workflow = w as unknown as Record<string, unknown>;
            return {
              description: workflow.description,
              id: String(workflow._id),
              name: workflow.name,
              status: workflow.status,
              updatedAt: workflow.updatedAt,
            };
          }) ?? [],
      },
      success: true,
    };
  }

  private buildMetricItems(
    items: Array<{
      change?: number;
      decimals?: number;
      label: string;
      suffix?: string;
      value: number;
    }>,
  ): Record<string, unknown> {
    return {
      items,
    };
  }

  private mapIngredientToPostCategory(category: unknown): PostCategory {
    if (category === IngredientCategory.IMAGE) {
      return PostCategory.IMAGE;
    }

    if (category === IngredientCategory.VIDEO) {
      return PostCategory.VIDEO;
    }

    return PostCategory.POST;
  }

  private normalizePlatforms(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return Array.from(
      new Set(
        value
          .filter(
            (platform): platform is string => typeof platform === 'string',
          )
          .map((platform) => platform.trim().toLowerCase())
          .filter((platform) => platform.length > 0),
      ),
    );
  }

  private async resolveIngredientForContent(
    contentId: string,
    organizationId: string,
  ): Promise<Record<string, unknown> | null> {
    if (!this.ingredientsService || !Types.ObjectId.isValid(contentId)) {
      return null;
    }

    return (await this.ingredientsService.findOne({
      _id: new Types.ObjectId(contentId),
      isDeleted: false,
      organization: new Types.ObjectId(organizationId),
    })) as unknown as Record<string, unknown> | null;
  }

  private async resolveBrandCredentials(params: {
    brandId: unknown;
    organizationId: string;
    platforms?: string[];
  }): Promise<Array<Record<string, unknown>>> {
    if (
      !this.credentialsService ||
      !params.brandId ||
      !Types.ObjectId.isValid(String(params.brandId))
    ) {
      return [];
    }

    const filter: Record<string, unknown> = {
      brand: new Types.ObjectId(String(params.brandId)),
      isConnected: true,
      isDeleted: false,
      organization: new Types.ObjectId(params.organizationId),
    };

    if (params.platforms && params.platforms.length > 0) {
      filter.platform = { $in: params.platforms };
    }

    return (await this.credentialsService.find(filter)) as unknown as Array<
      Record<string, unknown>
    >;
  }

  private buildPublishPostCard(params: {
    availablePlatforms: string[];
    contentId: string;
    defaultCaption?: string;
    defaultPlatforms?: string[];
    description: string;
    scheduledAt?: string;
    title: string;
  }): AgentUiAction {
    const selectedPlatforms =
      params.defaultPlatforms && params.defaultPlatforms.length > 0
        ? params.defaultPlatforms.filter((platform) =>
            params.availablePlatforms.includes(platform),
          )
        : params.availablePlatforms;

    return {
      contentId: params.contentId,
      data: {
        availablePlatforms: params.availablePlatforms,
      },
      description: params.description,
      id: `publish-post-${Date.now()}`,
      platforms: selectedPlatforms,
      requiresConfirmation: true,
      scheduledAt: params.scheduledAt,
      textContent: params.defaultCaption,
      title: params.title,
      type: 'publish_post_card' as const,
    };
  }

  private async buildPublishCardResult(
    params: {
      caption?: string;
      contentId: string;
      platforms?: string[];
      scheduledAt?: string;
    },
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const ingredient = await this.resolveIngredientForContent(
      params.contentId,
      ctx.organizationId,
    );

    if (!ingredient) {
      return {
        creditsUsed: 0,
        error: `Content ${params.contentId} not found`,
        success: false,
      };
    }

    const requestedPlatforms = params.platforms ?? [];
    const credentials = await this.resolveBrandCredentials({
      brandId: ingredient.brand,
      organizationId: ctx.organizationId,
    });
    const availablePlatforms = Array.from(
      new Set(
        credentials
          .map((credential) => String(credential.platform || '').toLowerCase())
          .filter((platform) => platform.length > 0),
      ),
    );

    if (availablePlatforms.length === 0) {
      return {
        creditsUsed: 0,
        error: 'No connected social accounts are available for this content.',
        success: false,
      };
    }

    const defaultPlatforms =
      requestedPlatforms.length > 0
        ? availablePlatforms.filter((platform) =>
            requestedPlatforms.includes(platform),
          )
        : availablePlatforms;

    if (requestedPlatforms.length > 0 && defaultPlatforms.length === 0) {
      return {
        creditsUsed: 0,
        error:
          'None of the requested platforms have connected accounts for this content.',
        success: false,
      };
    }

    return {
      creditsUsed: 0,
      data: {
        availablePlatforms,
        contentId: params.contentId,
      },
      nextActions: [
        this.buildPublishPostCard({
          availablePlatforms,
          contentId: params.contentId,
          defaultCaption: params.caption,
          defaultPlatforms,
          description:
            params.scheduledAt != null
              ? 'Review the caption, schedule, and platforms before confirming.'
              : 'Review the caption and platforms before confirming.',
          scheduledAt: params.scheduledAt,
          title:
            params.scheduledAt != null
              ? 'Schedule selected content'
              : 'Publish selected content',
        }),
      ],
      success: true,
    };
  }

  private async resolveLatestPublishedPostForIngredient(
    ingredientId: string,
    organizationId: string,
  ): Promise<Record<string, unknown> | null> {
    const results = await this.postsService.findAll(
      [
        {
          $match: {
            ingredients: new Types.ObjectId(ingredientId),
            isDeleted: false,
            organization: new Types.ObjectId(organizationId),
            status: {
              $in: [PostStatus.PUBLIC, PostStatus.PRIVATE, PostStatus.UNLISTED],
            },
          },
        },
        {
          $sort: {
            createdAt: -1,
            publicationDate: -1,
          },
        },
        { $limit: 1 },
      ],
      { pagination: false },
    );

    const [post] =
      (results.docs as unknown as Record<string, unknown>[] | undefined) ?? [];
    return post ?? null;
  }

  private buildPostAnalyticsSnapshotAction(params: {
    metrics: Record<string, unknown>;
    postId: string;
    title: string;
  }): AgentUiAction {
    return {
      ctas: [
        {
          href: `/analytics/posts?postId=${params.postId}`,
          label: 'Open analytics',
        },
        { href: '/content/posts', label: 'Open posts' },
      ],
      description: 'Latest analytics for this published content.',
      id: `post-analytics-${params.postId}-${Date.now()}`,
      metrics: params.metrics,
      title: params.title,
      type: 'analytics_snapshot_card' as const,
    };
  }

  private async getAnalytics(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const postId =
      typeof params.postId === 'string' && params.postId.trim().length > 0
        ? params.postId.trim()
        : undefined;
    const contentId =
      typeof params.contentId === 'string' && params.contentId.trim().length > 0
        ? params.contentId.trim()
        : typeof params.ingredientId === 'string' &&
            params.ingredientId.trim().length > 0
          ? params.ingredientId.trim()
          : undefined;

    if (postId) {
      if (!Types.ObjectId.isValid(postId)) {
        return {
          creditsUsed: 0,
          error: `Post ${postId} not found`,
          success: false,
        };
      }

      const post = await this.postsService.findOne({
        _id: new Types.ObjectId(postId),
        isDeleted: false,
        organization: new Types.ObjectId(ctx.organizationId),
      });

      if (!post) {
        return {
          creditsUsed: 0,
          error: `Post ${postId} not found`,
          success: false,
        };
      }

      const summary =
        await this.postAnalyticsService.getPostAnalyticsSummary(postId);
      const metrics = this.buildMetricItems([
        { label: 'Views', value: summary.totalViews },
        { label: 'Likes', value: summary.totalLikes },
        { label: 'Comments', value: summary.totalComments },
        {
          decimals: 1,
          label: 'Engagement',
          suffix: '%',
          value: summary.avgEngagementRate,
        },
      ]);

      return {
        creditsUsed: 0,
        data: {
          postId,
          summary,
        },
        nextActions: [
          this.buildPostAnalyticsSnapshotAction({
            metrics,
            postId,
            title: 'Post analytics snapshot',
          }),
        ],
        success: true,
      };
    }

    if (contentId) {
      const ingredient = await this.resolveIngredientForContent(
        contentId,
        ctx.organizationId,
      );

      if (!ingredient) {
        return {
          creditsUsed: 0,
          error: `Content ${contentId} not found`,
          success: false,
        };
      }

      const publishedPost = await this.resolveLatestPublishedPostForIngredient(
        contentId,
        ctx.organizationId,
      );

      if (!publishedPost?._id) {
        const publishCardResult = await this.buildPublishCardResult(
          {
            contentId,
          },
          ctx,
        );

        return {
          creditsUsed: 0,
          data: {
            contentId,
            message:
              'This content does not have a published post yet, so analytics are not available.',
          },
          nextActions: publishCardResult.nextActions,
          success: true,
        };
      }

      const resolvedPostId = String(publishedPost._id);
      const summary =
        await this.postAnalyticsService.getPostAnalyticsSummary(resolvedPostId);
      const metrics = this.buildMetricItems([
        { label: 'Views', value: summary.totalViews },
        { label: 'Likes', value: summary.totalLikes },
        { label: 'Comments', value: summary.totalComments },
        {
          decimals: 1,
          label: 'Engagement',
          suffix: '%',
          value: summary.avgEngagementRate,
        },
      ]);

      return {
        creditsUsed: 0,
        data: {
          contentId,
          postId: resolvedPostId,
          summary,
        },
        nextActions: [
          this.buildPostAnalyticsSnapshotAction({
            metrics,
            postId: resolvedPostId,
            title: 'Content analytics snapshot',
          }),
        ],
        success: true,
      };
    }

    const period = (params.period as string) || '30d';
    const daysMap: Record<string, number> = { '7d': 7, '30d': 30, '90d': 90 };
    const days = daysMap[period] || 30;

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const overview = (await this.analyticsService.getOverview(
      startDate.toISOString(),
      endDate.toISOString(),
      undefined,
      ctx.organizationId,
    )) as {
      avgEngagementRate?: number;
      growth?: {
        engagement?: number;
        posts?: number;
        views?: number;
      };
      totalEngagement?: number;
      totalPosts?: number;
      totalViews?: number;
    };

    return {
      creditsUsed: 0,
      data: { overview, period },
      nextActions: [
        {
          ctas: [
            { href: '/analytics/overview', label: 'Open analytics dashboard' },
            {
              href: '/automation/analytics',
              label: 'Open automation analytics',
            },
          ],
          data: { overview, period },
          id: `analytics-${Date.now()}`,
          metrics: this.buildMetricItems([
            {
              change: overview.growth?.views,
              label: 'Views',
              value: overview.totalViews ?? 0,
            },
            {
              change: overview.growth?.engagement,
              label: 'Engagement',
              value: overview.totalEngagement ?? 0,
            },
            {
              change: overview.growth?.posts,
              label: 'Posts',
              value: overview.totalPosts ?? 0,
            },
            {
              decimals: 1,
              label: 'Avg engagement',
              suffix: '%',
              value: overview.avgEngagementRate ?? 0,
            },
          ]),
          title: `Analytics summary (${period})`,
          type: 'analytics_snapshot_card',
        },
      ],
      success: true,
    };
  }

  private async getConnectionStatus(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    if (!this.credentialsService) {
      return {
        creditsUsed: 0,
        error: 'Credentials service not available',
        success: false,
      };
    }

    const platform = String(params.platform || '')
      .trim()
      .toLowerCase();
    const credential = platform
      ? await this.credentialsService.findOne({
          isConnected: true,
          isDeleted: false,
          organization: new Types.ObjectId(ctx.organizationId),
          platform,
        })
      : null;

    return {
      creditsUsed: 0,
      data: {
        connected: !!credential,
        credentialId: credential ? String(credential._id) : null,
        platform: platform || null,
      },
      nextActions: credential
        ? []
        : [this.buildOAuthConnectCard(platform, '/agent', 'status')],
      success: true,
    };
  }

  private async initiateOAuthConnect(
    params: Record<string, unknown>,
    _ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const platform = String(params.platform || '')
      .trim()
      .toLowerCase();
    const isOnboarding = Boolean(params.isOnboarding);
    const returnTo = isOnboarding ? '/agent/onboarding' : '/agent';

    return {
      creditsUsed: 0,
      data: {
        platform: platform || null,
        returnTo,
      },
      nextActions: [this.buildOAuthConnectCard(platform, returnTo, 'init')],
      success: true,
    };
  }

  private buildOAuthConnectCard(
    platform: string,
    returnTo: string,
    mode: 'init' | 'status',
  ): AgentUiAction {
    const normalizedPlatform = platform.trim().toLowerCase();
    const isGenericPicker = !normalizedPlatform;

    if (isGenericPicker) {
      return {
        ctas: [
          {
            href: `/settings/organization/credentials?returnTo=${encodeURIComponent(returnTo)}`,
            label: 'Open integrations',
          },
        ],
        data: { isGenericIntegrationPicker: true, returnTo },
        id: `oauth-connect-integrations-${Date.now()}`,
        title: 'Choose an integration',
        type: 'oauth_connect_card',
      };
    }

    const connectHref = `/settings/organization/credentials?connect=${normalizedPlatform}&returnTo=${encodeURIComponent(returnTo)}`;
    const label = normalizedPlatform;

    return {
      ctas: [{ href: connectHref, label: `Connect ${label}` }],
      data: { platform: normalizedPlatform, returnTo },
      id: `${mode === 'init' ? 'oauth-init' : 'oauth-connect'}-${normalizedPlatform}-${Date.now()}`,
      platform: normalizedPlatform,
      title:
        mode === 'status'
          ? `${label} not connected`
          : `Connect ${label} account`,
      type: 'oauth_connect_card',
    };
  }

  private async getTrends(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const platform = params.platform as string | undefined;

    const cachedTrends = await this.trendsService.getTrends(
      ctx.organizationId,
      undefined,
      platform,
      { allowFetchIfMissing: false },
    );
    const trends =
      cachedTrends.length > 0
        ? cachedTrends
        : await this.trendsService.getTrends(
            ctx.organizationId,
            undefined,
            platform,
            { allowFetchIfMissing: true },
          );

    return {
      creditsUsed: 0,
      data: {
        count: trends.length,
        trends: trends.slice(0, 20).map((t: Record<string, unknown>) => ({
          id: String(t._id ?? t.id),
          platform: t.platform,
          score: t.score,
          topic: t.topic ?? t.name,
        })),
      },
      nextActions: [
        this.buildTrendsSummaryCard(
          platform,
          trends as Record<string, unknown>[],
        ),
      ],
      success: true,
    };
  }

  private async listAdsResearch(
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
      adAccountId: this.readOptionalString(params.adAccountId),
      brandId: brandContext.brandId,
      brandName: brandContext.brandName,
      channel: this.readAdsChannel(params.channel),
      credentialId: this.readOptionalString(params.credentialId),
      industry:
        this.readOptionalString(params.industry) ?? brandContext.industry,
      limit: this.readOptionalNumber(params.limit),
      loginCustomerId: this.readOptionalString(params.loginCustomerId),
      metric: this.readAdsMetric(params.metric),
      platform: this.readAdsPlatform(params.platform),
      source: this.readAdsSource(params.source) ?? 'all',
      timeframe: this.readAdsTimeframe(params.timeframe),
    };

    const result = await this.adsResearchService.listAds(
      ctx.organizationId,
      filters,
    );
    const surfacedItems = [...result.publicAds, ...result.connectedAds].slice(
      0,
      6,
    );
    const platformHref =
      result.summary.selectedPlatform === 'google'
        ? '/research/ads/google'
        : result.summary.selectedPlatform === 'meta'
          ? '/research/ads/meta'
          : '/research/ads';

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
            { href: '/research/ads', label: 'Open all ads' },
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

  private async getAdResearchDetail(
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

    const source = this.readAdsSource(params.source);
    const adId = this.readOptionalString(params.adId);

    if (!source || source === 'all' || !adId) {
      return {
        creditsUsed: 0,
        error: 'adId and source are required to inspect an ad.',
        success: false,
      };
    }

    const detail = await this.adsResearchService.getAdDetail(
      ctx.organizationId,
      {
        adAccountId: this.readOptionalString(params.adAccountId),
        channel: this.readAdsChannel(params.channel),
        credentialId: this.readOptionalString(params.credentialId),
        id: adId,
        loginCustomerId: this.readOptionalString(params.loginCustomerId),
        platform: this.readAdsPlatform(params.platform),
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
              href:
                detail.platform === 'google'
                  ? '/research/ads/google'
                  : '/research/ads/meta',
              label: 'Open platform ads',
            },
            { href: '/research/ads', label: 'Open ads hub' },
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

  private async createAdRemixWorkflow(
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
          // TODO: These hrefs should be org-scoped (e.g. /{orgSlug}/{brandSlug}/workflows/...).
          // The agent orchestrator service doesn't have org/brand context in scope.
          // The client should prefix these with the org URL, or the service needs
          // org/brand slugs passed through the execution context.
          ctas: [
            {
              href: `/workflows/${workflow.workflowId}`,
              label: 'Open workflow',
            },
            {
              href: '/workflows',
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

  private async generateAdPack(
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
          ctas: [{ href: '/research/ads', label: 'Open ads hub' }],
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

  private async prepareAdLaunchReview(
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
      campaignName: this.readOptionalString(params.campaignName),
      createWorkflow: params.createWorkflow === true,
      dailyBudget: this.readOptionalNumber(params.dailyBudget),
    });

    return {
      creditsUsed: 0,
      data: {
        launchPrep,
      },
      nextActions: [
        {
          // TODO: These hrefs should be org-scoped (see TODO above in buildAdRemixWorkflow).
          ctas: [
            ...(launchPrep.workflowId
              ? [
                  {
                    href: `/workflows/${launchPrep.workflowId}`,
                    label: 'Open workflow',
                  },
                ]
              : []),
            { href: '/research/ads', label: 'Open ads hub' },
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

  private readOptionalString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim().length > 0
      ? value.trim()
      : undefined;
  }

  private readOptionalNumber(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value)
      ? value
      : undefined;
  }

  private readAdsSource(value: unknown): AdsResearchSource | undefined {
    return value === 'public' || value === 'my_accounts' || value === 'all'
      ? value
      : undefined;
  }

  private readAdsPlatform(value: unknown): AdsResearchPlatform | undefined {
    return value === 'meta' || value === 'google' ? value : undefined;
  }

  private readAdsChannel(value: unknown): AdsChannel | undefined {
    return value === 'all' ||
      value === 'search' ||
      value === 'display' ||
      value === 'youtube'
      ? value
      : undefined;
  }

  private readAdsMetric(value: unknown): AdsResearchFilters['metric'] {
    return value === 'performanceScore' ||
      value === 'ctr' ||
      value === 'roas' ||
      value === 'conversions' ||
      value === 'spendEfficiency'
      ? value
      : undefined;
  }

  private readAdsTimeframe(value: unknown): AdsResearchFilters['timeframe'] {
    return value === 'last_7_days' ||
      value === 'last_30_days' ||
      value === 'last_90_days' ||
      value === 'all_time'
      ? value
      : undefined;
  }

  private async resolveAdsBrandContext(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<{
    brandId?: string;
    brandName?: string;
    industry?: string;
  }> {
    const explicitBrandId = this.readOptionalString(params.brandId);
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
      brandId: String(brandRecord._id ?? brandLookupId),
      brandName:
        this.readOptionalString(brandRecord.name) ??
        this.readOptionalString(brandRecord.label),
      industry:
        this.readOptionalString(brandRecord.industry) ??
        this.readOptionalString(brandRecord.niche) ??
        this.readOptionalString(brandRecord.category),
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
    const source = this.readAdsSource(params.source);
    const adId = this.readOptionalString(params.adId);

    if (!source || source === 'all' || !adId) {
      return { error: 'adId and source are required for ads remix actions.' };
    }

    const brandContext = await this.resolveAdsBrandContext(params, ctx);

    return {
      adAccountId: this.readOptionalString(params.adAccountId),
      adId,
      brandId: brandContext.brandId,
      brandName: brandContext.brandName,
      channel: this.readAdsChannel(params.channel),
      credentialId: this.readOptionalString(params.credentialId),
      industry:
        this.readOptionalString(params.industry) ?? brandContext.industry,
      loginCustomerId: this.readOptionalString(params.loginCustomerId),
      objective: this.readOptionalString(params.objective),
      organizationId: ctx.organizationId,
      platform: this.readAdsPlatform(params.platform),
      source,
      userId: ctx.userId,
    };
  }

  // ──────────────────────────────────────────────
  // WRITE TOOLS (credits deducted by agent orchestrator)
  // ──────────────────────────────────────────────

  private async createPost(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const contentId =
      typeof params.contentId === 'string' && params.contentId.trim().length > 0
        ? params.contentId.trim()
        : typeof params.ingredientId === 'string' &&
            params.ingredientId.trim().length > 0
          ? params.ingredientId.trim()
          : undefined;

    if (contentId) {
      const caption =
        typeof params.caption === 'string'
          ? params.caption.trim()
          : typeof params.content === 'string'
            ? params.content.trim()
            : typeof params.textContent === 'string'
              ? params.textContent.trim()
              : undefined;
      const platforms = this.normalizePlatforms(
        Array.isArray(params.platforms)
          ? params.platforms
          : typeof params.platform === 'string'
            ? [params.platform]
            : [],
      );
      const scheduledAt =
        typeof params.scheduledAt === 'string' && params.scheduledAt.trim()
          ? params.scheduledAt.trim()
          : undefined;

      if (params.confirmed !== true) {
        return this.buildPublishCardResult(
          {
            caption,
            contentId,
            platforms,
            scheduledAt,
          },
          ctx,
        );
      }

      const ingredient = await this.resolveIngredientForContent(
        contentId,
        ctx.organizationId,
      );

      if (!ingredient) {
        return {
          creditsUsed: 0,
          error: `Content ${contentId} not found`,
          success: false,
        };
      }

      if (platforms.length === 0) {
        return {
          creditsUsed: 0,
          error: 'At least one platform is required to publish content.',
          success: false,
        };
      }

      const credentials = await this.resolveBrandCredentials({
        brandId: ingredient.brand,
        organizationId: ctx.organizationId,
        platforms,
      });

      if (credentials.length === 0) {
        return {
          creditsUsed: 0,
          error:
            'No connected social accounts are available for the selected platforms.',
          success: false,
        };
      }

      const createdPlatforms = credentials
        .map((credential) => String(credential.platform || '').toLowerCase())
        .filter((platform) => platform.length > 0);
      const missingPlatforms = platforms.filter(
        (platform) => !createdPlatforms.includes(platform),
      );
      const groupId = new Types.ObjectId().toHexString();
      const scheduledDate = scheduledAt ? new Date(scheduledAt) : undefined;
      const postIds: string[] = [];

      for (const credential of credentials) {
        const platform = credential.platform as CredentialPlatform;
        const post = await this.postsService.create({
          ...(ctx.runId ? { agentRunId: new Types.ObjectId(ctx.runId) } : {}),
          ...(ctx.strategyId
            ? { agentStrategyId: new Types.ObjectId(ctx.strategyId) }
            : {}),
          brand: new Types.ObjectId(String(ingredient.brand)),
          category: this.mapIngredientToPostCategory(ingredient.category),
          credential: new Types.ObjectId(String(credential._id)),
          description: caption ?? '',
          groupId,
          ingredients: [new Types.ObjectId(contentId)],
          label: (caption ?? '').trim().slice(0, 100) || 'Agent publish',
          organization: new Types.ObjectId(ctx.organizationId),
          platform,
          scheduledDate,
          source: 'agent',
          status: scheduledDate ? PostStatus.SCHEDULED : PostStatus.PENDING,
          user: new Types.ObjectId(ctx.userId),
        } as never);

        postIds.push(String((post as { _id: Types.ObjectId })._id));

        if (platform === CredentialPlatform.YOUTUBE) {
          await this.postsService.handleYoutubePost(post as never);
        }
      }

      const description = scheduledDate
        ? `Scheduled ${postIds.length} post${postIds.length === 1 ? '' : 's'} for ${createdPlatforms.join(', ')}.`
        : `Queued ${postIds.length} post${postIds.length === 1 ? '' : 's'} for publishing on ${createdPlatforms.join(', ')}.`;

      return {
        creditsUsed: 0,
        data: {
          contentId,
          createdPlatforms,
          missingPlatforms,
          postIds,
          scheduledAt,
          totalCreated: postIds.length,
        },
        nextActions: [
          {
            ctas: [
              { href: '/content/posts', label: 'Open posts' },
              ...(postIds[0]
                ? [
                    {
                      href: `/analytics/posts?postId=${postIds[0]}`,
                      label: 'Open analytics',
                    },
                  ]
                : []),
            ],
            description:
              missingPlatforms.length > 0
                ? `${description} Missing connected accounts for: ${missingPlatforms.join(', ')}.`
                : description,
            id: `published-posts-${groupId}`,
            title: scheduledDate ? 'Posts scheduled' : 'Posts queued',
            type: 'content_preview_card' as const,
          },
        ],
        success: true,
      };
    }

    const post = await this.postsService.create({
      ...(ctx.runId ? { agentRunId: new Types.ObjectId(ctx.runId) } : {}),
      ...(ctx.strategyId
        ? { agentStrategyId: new Types.ObjectId(ctx.strategyId) }
        : {}),
      description: params.content as string,
      label: ((params.content as string) || '').substring(0, 100),
      organization: new Types.ObjectId(ctx.organizationId),
      source: 'agent',
      status: PostStatus.DRAFT,
      user: new Types.ObjectId(ctx.userId),
    } as never);

    return {
      creditsUsed: 0,
      data: {
        id: String(post._id),
        status: PostStatus.DRAFT,
      },
      success: true,
    };
  }

  private async schedulePost(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const postId = params.postId as string;
    const scheduledAt = params.scheduledAt as string;

    const post = await this.postsService.findOne({
      _id: postId,
      isDeleted: false,
      organization: ctx.organizationId,
    });

    if (!post) {
      return {
        creditsUsed: 0,
        error: `Post ${postId} not found`,
        success: false,
      };
    }

    await this.postsService.patch(postId, {
      scheduledDate: new Date(scheduledAt),
      status: PostStatus.SCHEDULED,
    } as never);

    return {
      creditsUsed: 1,
      data: {
        id: postId,
        scheduledAt,
        status: PostStatus.SCHEDULED,
      },
      success: true,
    };
  }

  private async createWorkflowFromRecurringScaffold(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const prompt = String(params.prompt || '').trim();
    const schedule = String(params.schedule || '').trim();
    const requestedContentType = String(
      params.contentType || 'image',
    ).toLowerCase();
    const contentType =
      requestedContentType === 'video' ||
      requestedContentType === 'post' ||
      requestedContentType === 'newsletter'
        ? requestedContentType
        : 'image';
    const timezone =
      typeof params.timezone === 'string' && params.timezone.trim()
        ? params.timezone.trim()
        : 'UTC';
    const requestedCount =
      typeof params.count === 'number'
        ? params.count
        : Number.parseInt(String(params.count || '1'), 10);
    const count = Number.isFinite(requestedCount)
      ? Math.max(1, Math.min(requestedCount, 12))
      : 1;
    const diversityMode =
      params.diversityMode === 'low' ||
      params.diversityMode === 'high' ||
      params.diversityMode === 'medium'
        ? params.diversityMode
        : 'medium';
    const styleNotes =
      typeof params.styleNotes === 'string' ? params.styleNotes.trim() : '';
    const negativePrompt =
      typeof params.negativePrompt === 'string'
        ? params.negativePrompt.trim()
        : '';

    if (!prompt || !schedule) {
      return {
        creditsUsed: 0,
        error: 'prompt and schedule are required',
        success: false,
      };
    }

    const brand = await this.resolveWorkflowBrand(params, ctx);
    if (!brand) {
      return {
        creditsUsed: 0,
        error:
          'No valid brand is available. Select a brand or refresh your brand context before creating a workflow.',
        success: false,
      };
    }
    const brandId = String(brand._id);
    const brandObjectId = new Types.ObjectId(brandId);
    const brandLabel = String(brand.label || 'your brand');
    const countLabel = count > 1 ? `${count} ${contentType}s per run` : null;

    const workflowLabel =
      String(params.label || params.name || '').trim() ||
      `${
        contentType === 'video'
          ? 'Video'
          : contentType === 'post'
            ? 'Post'
            : contentType === 'newsletter'
              ? 'Newsletter'
              : 'Image'
      } automation: ${prompt.slice(0, 48)}`;
    const taskDescription = [
      `Recurring ${contentType} generation workflow`,
      countLabel ? `Batch size: ${countLabel}` : null,
      `Prompt: ${prompt}`,
      styleNotes ? `Style notes: ${styleNotes}` : null,
      negativePrompt ? `Avoid: ${negativePrompt}` : null,
      `Diversity: ${diversityMode}`,
      `Schedule: ${schedule}`,
      `Timezone: ${timezone}`,
    ]
      .filter(Boolean)
      .join('\n');

    const workflowMetadata = {
      batchCount: count,
      brief: {
        contentType,
        count,
        diversityMode,
        negativePrompt: negativePrompt || undefined,
        prompt,
        styleNotes: styleNotes || undefined,
      },
      contentType,
      createdFrom: 'agent',
      originatingTool: AgentToolName.CREATE_WORKFLOW,
      prompt,
      sourceAssetId:
        typeof params.sourceAssetId === 'string'
          ? params.sourceAssetId
          : undefined,
      workflowType: 'recurring-agent-workflow',
    };

    const imageNodes =
      contentType === 'image'
        ? Array.from({ length: count }, (_, idx) => ({
            data: {
              config: {
                aspectRatio:
                  typeof params.aspectRatio === 'string'
                    ? params.aspectRatio
                    : '1:1',
                model:
                  typeof params.model === 'string'
                    ? params.model
                    : 'genfeed-ai/flux2-dev',
                prompt: this.buildImageVariationPrompt(
                  prompt,
                  idx + 1,
                  count,
                  diversityMode,
                  styleNotes,
                  negativePrompt,
                ),
                style: styleNotes || 'social-media',
              },
              label: count > 1 ? `Generate Image ${idx + 1}` : 'Generate Image',
            },
            id: `generate-image-${idx + 1}`,
            position: { x: 120 + idx * 220, y: 120 },
            type: 'ai-generate-image',
          }))
        : [];

    const workflow = await this.workflowsService.createWorkflow(
      ctx.userId,
      ctx.organizationId,
      {
        brands: [brandObjectId],
        description: taskDescription,
        edges: [],
        inputVariables: [],
        isScheduleEnabled: true,
        label: workflowLabel,
        metadata: workflowMetadata,
        nodes:
          contentType === 'image'
            ? imageNodes
            : [
                {
                  data: {
                    config:
                      contentType === 'video'
                        ? {
                            aspectRatio:
                              typeof params.aspectRatio === 'string'
                                ? params.aspectRatio
                                : '9:16',
                            duration:
                              typeof params.duration === 'number'
                                ? params.duration
                                : 8,
                            model:
                              typeof params.model === 'string'
                                ? params.model
                                : 'kling-v2',
                            prompt,
                          }
                        : contentType === 'post'
                          ? {
                              brandId,
                              brandLabel,
                              credentialId:
                                typeof params.credentialId === 'string'
                                  ? params.credentialId
                                  : undefined,
                              prompt,
                              timezone,
                            }
                          : {
                              brandId,
                              brandLabel,
                              instructions:
                                typeof params.instructions === 'string'
                                  ? params.instructions
                                  : undefined,
                              prompt,
                              timezone,
                            },
                    label:
                      contentType === 'video'
                        ? 'Generate Video'
                        : contentType === 'post'
                          ? 'Generate Post'
                          : 'Generate Newsletter',
                  },
                  id: 'generate-primary',
                  position: { x: 120, y: 120 },
                  type:
                    contentType === 'video'
                      ? 'ai-generate-video'
                      : contentType === 'post'
                        ? 'ai-generate-post'
                        : 'ai-generate-newsletter',
                },
              ],
        schedule,
        timezone,
        trigger: WorkflowTrigger.MANUAL,
      } as never,
    );

    const workflowId = String(workflow._id ?? workflow.id);
    const nextRunAt = computeNextRunAtOrThrow(schedule, timezone);
    const scheduleSummary = formatRecurringSchedule(schedule, timezone, count);

    return this.buildWorkflowCreatedResult({
      creditsUsed: 1,
      description: taskDescription,
      extraData: {
        brandId,
        count,
        workflowId,
      },
      nextRunAt,
      schedule,
      scheduleSummary,
      successDescription: `Recurring ${contentType} automation is ready for ${brandLabel}.`,
      timezone,
      workflowId,
      workflowLabel,
    });
  }

  private async installOfficialWorkflow(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const confirmed = params.confirmed === true;
    const schedule =
      typeof params.schedule === 'string' && params.schedule.trim()
        ? params.schedule.trim()
        : undefined;
    const timezone =
      typeof params.timezone === 'string' && params.timezone.trim()
        ? params.timezone.trim()
        : 'UTC';

    let source: OfficialWorkflowSource | null =
      typeof params.sourceId === 'string' &&
      typeof params.sourceType === 'string' &&
      params.sourceId.trim() &&
      params.sourceType.trim()
        ? {
            confidence: 999,
            description:
              typeof params.sourceDescription === 'string'
                ? params.sourceDescription
                : undefined,
            id: params.sourceId,
            kind: params.sourceType as OfficialWorkflowSourceKind,
            name:
              typeof params.sourceName === 'string' && params.sourceName.trim()
                ? params.sourceName
                : 'Official workflow',
            slug:
              typeof params.sourceSlug === 'string'
                ? params.sourceSlug
                : undefined,
          }
        : null;

    if (!source) {
      source = await this.resolveOfficialWorkflowSource(params);
    }

    if (!source) {
      if (!confirmed) {
        return {
          creditsUsed: 0,
          data: {
            confirmationRequired: true,
            resolution: 'generated',
          },
          nextActions: [
            {
              description:
                'No strong official workflow match was found. Reply to confirm and I will generate an org-owned workflow instead.',
              id: `workflow-bootstrap-preview-generated-${Date.now()}`,
              scheduleSummary: schedule
                ? formatRecurringSchedule(schedule, timezone)
                : undefined,
              title: 'Generate a new workflow?',
              type: 'workflow_created_card' as const,
              workflowDescription:
                typeof params.prompt === 'string' ? params.prompt : undefined,
              workflowName:
                typeof params.label === 'string' && params.label.trim()
                  ? params.label.trim()
                  : 'Generated workflow',
            },
          ],
          requiresConfirmation: true,
          success: true,
        };
      }

      return this.createWorkflowFromRecurringScaffold(
        {
          ...params,
          contentType: this.inferBootstrapContentType(params),
          timezone,
        },
        ctx,
      );
    }

    if (!confirmed) {
      const marketplaceUrl = this.buildMarketplaceListingUrl(source.slug);
      const confirmationPayload = {
        brandId:
          typeof params.brandId === 'string' && params.brandId.trim()
            ? params.brandId
            : undefined,
        contentType: this.inferBootstrapContentType(params),
        label:
          typeof params.label === 'string' && params.label.trim()
            ? params.label
            : undefined,
        prompt:
          typeof params.prompt === 'string' && params.prompt.trim()
            ? params.prompt
            : undefined,
        schedule,
        sourceDescription: source.description,
        sourceId: source.id,
        sourceName: source.name,
        sourceSlug: source.slug,
        sourceType: source.kind,
        timezone,
      };

      return {
        creditsUsed: 0,
        data: {
          confirmationRequired: true,
          resolution: source.kind,
          sourceDescription: source.description,
          sourceId: source.id,
          sourceName: source.name,
          sourceSlug: source.slug,
          sourceType: source.kind,
        },
        nextActions: [
          {
            ctas: marketplaceUrl
              ? [
                  {
                    action: 'confirm_install_official_workflow',
                    label: 'Confirm install',
                    payload: confirmationPayload,
                  },
                  { href: marketplaceUrl, label: 'Open source listing' },
                ]
              : [
                  {
                    action: 'confirm_install_official_workflow',
                    label: 'Confirm install',
                    payload: confirmationPayload,
                  },
                ],
            description:
              'Confirm to install this workflow into your organization, then apply your requested schedule and context.',
            id: `workflow-bootstrap-preview-${source.kind}-${source.id}`,
            scheduleSummary: schedule
              ? formatRecurringSchedule(schedule, timezone)
              : undefined,
            title: 'Install official workflow?',
            type: 'workflow_created_card' as const,
            workflowDescription: source.description,
            workflowName: source.name,
          },
        ],
        requiresConfirmation: true,
        success: true,
      };
    }

    if (source.kind === 'seeded-template') {
      const workflow = await this.workflowsService.createWorkflow(
        ctx.userId,
        ctx.organizationId,
        {
          isScheduleEnabled: Boolean(schedule),
          label:
            typeof params.label === 'string' && params.label.trim()
              ? params.label.trim()
              : source.name,
          metadata: {
            createdFrom: 'agent',
            sourceTemplateId: source.id,
            sourceType: 'seeded-template',
          },
          schedule,
          templateId: source.id,
          timezone,
          trigger: WorkflowTrigger.MANUAL,
        } as never,
      );

      const workflowId = String(workflow._id ?? workflow.id);
      await this.applyInstalledWorkflowContext(workflowId, ctx, params, source);

      const nextRunAt = schedule
        ? computeNextRunAtOrThrow(schedule, timezone)
        : null;

      return {
        creditsUsed: 0,
        data: {
          editorUrl: `/automations/editor/${workflowId}`,
          id: workflowId,
          installedFrom: source.kind,
          nextRunAt,
        },
        nextActions: [
          {
            ctas: [
              {
                href: `/automations/editor/${workflowId}`,
                label: 'Open workflow',
              },
              {
                href: '/automations/executions',
                label: 'Open executions',
              },
            ],
            description: 'Official workflow installed into your workspace.',
            id: `workflow-installed-${workflowId}`,
            nextRunAt: nextRunAt?.toISOString(),
            scheduleSummary: schedule
              ? formatRecurringSchedule(schedule, timezone)
              : undefined,
            title: 'Automation installed',
            type: 'workflow_created_card' as const,
            workflowDescription: source.description,
            workflowId,
            workflowName: source.name,
          },
        ],
        success: true,
      };
    }

    if (!this.marketplaceApiClient || !this.marketplaceInstallService) {
      return {
        creditsUsed: 0,
        error: 'Marketplace install services are unavailable.',
        success: false,
      };
    }

    const listing = await this.marketplaceApiClient.getListing(source.id);

    if (!listing) {
      return {
        creditsUsed: 0,
        error: 'Official marketplace workflow not found.',
        success: false,
      };
    }

    const ownership = await this.marketplaceApiClient.checkListingOwnership(
      source.id,
      ctx.userId,
      ctx.organizationId,
    );

    if (
      !ownership.owned &&
      ((listing.price ?? 0) > 0 || listing.pricingTier === 'premium')
    ) {
      const marketplaceUrl = this.buildMarketplaceListingUrl(listing.slug);

      return {
        creditsUsed: 0,
        data: {
          listingId: source.id,
          marketplaceUrl,
          requiresPurchase: true,
        },
        nextActions: [
          {
            ctas: marketplaceUrl
              ? [{ href: marketplaceUrl, label: 'Open marketplace listing' }]
              : [],
            description:
              'This official workflow is paid. Purchase it first, then I can install it into your workspace.',
            id: `workflow-purchase-required-${source.id}`,
            title: 'Purchase required',
            type: 'workflow_created_card' as const,
            workflowDescription: source.description,
            workflowName: source.name,
          },
        ],
        success: true,
      };
    }

    const purchase =
      ownership.purchase ??
      (await this.marketplaceApiClient.claimFreeItem(
        source.id,
        ctx.userId,
        ctx.organizationId,
      ));

    const installResult =
      await this.marketplaceInstallService.installToWorkspace(
        source.id,
        ctx.userId,
        ctx.organizationId,
      );

    await this.applyInstalledWorkflowContext(
      installResult.resourceId,
      ctx,
      params,
      source,
    );

    const nextRunAt = schedule
      ? computeNextRunAtOrThrow(schedule, timezone)
      : null;

    return {
      creditsUsed: 0,
      data: {
        editorUrl: `/automations/editor/${installResult.resourceId}`,
        id: installResult.resourceId,
        installedFrom: source.kind,
        nextRunAt,
        purchaseId: purchase ? String(purchase._id) : undefined,
      },
      nextActions: [
        {
          ctas: [
            {
              href: `/automations/editor/${installResult.resourceId}`,
              label: 'Open workflow',
            },
            {
              href: '/automations/executions',
              label: 'Open executions',
            },
          ],
          description: 'Official workflow installed into your workspace.',
          id: `workflow-installed-${installResult.resourceId}`,
          nextRunAt: nextRunAt?.toISOString(),
          scheduleSummary: schedule
            ? formatRecurringSchedule(schedule, timezone)
            : undefined,
          title: 'Automation installed',
          type: 'workflow_created_card' as const,
          workflowDescription: source.description,
          workflowId: installResult.resourceId,
          workflowName: source.name,
        },
      ],
      success: true,
    };
  }

  private async createCampaign(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const platform = String(params.platform || 'twitter').toLowerCase();
    const campaignType = String(params.campaignType || 'manual').toLowerCase();

    const createDto: CreateOutreachCampaignDto = {
      campaignType: campaignType as CampaignType,
      credential: new Types.ObjectId(String(params.credential)),
      description: (params.description as string) || '',
      isActive: true,
      label: String(params.label || 'Agent Campaign'),
      organization: new Types.ObjectId(ctx.organizationId),
      platform: platform as CampaignPlatform,
      user: new Types.ObjectId(ctx.userId),
    };

    const campaign = await this.campaignsService.create(createDto);
    const campaignId = String(campaign._id);

    return {
      creditsUsed: 1,
      data: {
        campaignId,
        label: campaign.label,
        platform: campaign.platform,
        status: campaign.status,
      },
      nextActions: [
        {
          ctas: [
            {
              href: `/orchestration/outreach-campaigns/${campaignId}`,
              label: 'Open campaign',
            },
            {
              action: 'start_campaign',
              label: 'Start campaign',
              payload: { campaignId },
            },
          ],
          data: {
            campaignId,
            label: campaign.label,
            platform: campaign.platform,
            status: campaign.status,
          },
          id: `campaign-created-${campaignId}`,
          title: `Campaign created: ${campaign.label}`,
          type: 'campaign_create_card',
        },
      ],
      success: true,
    };
  }

  private async startCampaign(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const campaignId = String(params.campaignId || '');
    const campaign = await this.campaignsService.start(
      campaignId,
      ctx.organizationId,
    );

    return {
      creditsUsed: 0,
      data: {
        campaignId,
        status: campaign.status,
      },
      requiresConfirmation: true,
      riskLevel: 'medium',
      success: true,
    };
  }

  private async pauseCampaign(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const campaignId = String(params.campaignId || '');
    const campaign = await this.campaignsService.pause(
      campaignId,
      ctx.organizationId,
    );

    return {
      creditsUsed: 0,
      data: {
        campaignId,
        status: campaign.status,
      },
      success: true,
    };
  }

  private async completeCampaign(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const campaignId = String(params.campaignId || '');
    const campaign = await this.campaignsService.complete(
      campaignId,
      ctx.organizationId,
    );

    return {
      creditsUsed: 0,
      data: {
        campaignId,
        status: campaign.status,
      },
      success: true,
    };
  }

  private async getCampaignAnalytics(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const campaignId = String(params.campaignId || '');
    const analytics = await this.campaignsService.getAnalytics(
      campaignId,
      ctx.organizationId,
    );

    return {
      creditsUsed: 0,
      data: {
        campaignId,
        repliesPerHour: analytics.repliesPerHour,
        successRate: analytics.successRate,
      },
      nextActions: [
        {
          ctas: [
            {
              href: `/orchestration/outreach-campaigns/${campaignId}`,
              label: 'Open campaign',
            },
          ],
          id: `campaign-analytics-${campaignId}-${Date.now()}`,
          metrics: this.buildMetricItems([
            {
              decimals: 1,
              label: 'Replies / hour',
              value: analytics.repliesPerHour ?? 0,
            },
            {
              decimals: 1,
              label: 'Success rate',
              suffix: '%',
              value: analytics.successRate ?? 0,
            },
          ]),
          title: 'Campaign analytics snapshot',
          type: 'analytics_snapshot_card',
        },
      ],
      success: true,
    };
  }

  private async createLivestreamBot(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    if (!this.botsService || !this.botsLivestreamService) {
      return {
        creditsUsed: 0,
        error: 'Livestream bot creation is not available in this environment.',
        success: false,
      };
    }

    const platform = this.normalizeLivestreamBotPlatform(params.platform);
    const label = String(params.label || '').trim();
    const channelId = String(params.channelId || '').trim();

    if (!platform || !label || !channelId) {
      return {
        creditsUsed: 0,
        error: 'platform, label, and channelId are required.',
        success: false,
      };
    }

    const brand = await this.resolveWorkflowBrand(params, ctx);
    if (!brand) {
      return {
        creditsUsed: 0,
        error:
          'No valid brand is available. Select a brand or refresh your brand context before creating a livestream bot.',
        success: false,
      };
    }

    const botPlatform = this.toBotPlatform(platform);
    const createdBot = await this.botsService.create({
      brand: new Types.ObjectId(String(brand._id)),
      category: LIVESTREAM_BOT_CATEGORY,
      description:
        typeof params.description === 'string'
          ? params.description.trim()
          : undefined,
      label,
      livestreamSettings: this.buildDefaultLivestreamSettings({
        contextTemplate:
          typeof params.contextTemplate === 'string'
            ? params.contextTemplate
            : undefined,
        hostPromptTemplate:
          typeof params.hostPromptTemplate === 'string'
            ? params.hostPromptTemplate
            : undefined,
        linkLabel:
          typeof params.linkLabel === 'string' ? params.linkLabel : undefined,
        linkUrl:
          typeof params.linkUrl === 'string' ? params.linkUrl : undefined,
        maxAutoPostsPerHour:
          typeof params.maxAutoPostsPerHour === 'number'
            ? params.maxAutoPostsPerHour
            : undefined,
        minimumMessageGapSeconds:
          typeof params.minimumMessageGapSeconds === 'number'
            ? params.minimumMessageGapSeconds
            : undefined,
        platform,
        scheduledCadenceMinutes:
          typeof params.scheduledCadenceMinutes === 'number'
            ? params.scheduledCadenceMinutes
            : undefined,
        transcriptEnabled:
          typeof params.transcriptEnabled === 'boolean'
            ? params.transcriptEnabled
            : undefined,
      }),
      organization: new Types.ObjectId(ctx.organizationId),
      platforms: [botPlatform],
      settings: {
        messagesPerMinute: 5,
        responseDelaySeconds: 5,
        responses: [],
        triggers: [],
      },
      status: BotStatus.ACTIVE,
      targets: [
        {
          channelId,
          channelLabel:
            typeof params.botChannelLabel === 'string'
              ? params.botChannelLabel.trim() || undefined
              : undefined,
          channelUrl:
            typeof params.botChannelUrl === 'string'
              ? params.botChannelUrl.trim() || undefined
              : undefined,
          credentialId:
            typeof params.credentialId === 'string' &&
            Types.ObjectId.isValid(params.credentialId)
              ? new Types.ObjectId(params.credentialId)
              : undefined,
          isEnabled: true,
          liveChatId:
            platform === 'youtube' && typeof params.liveChatId === 'string'
              ? params.liveChatId.trim() || undefined
              : undefined,
          platform: botPlatform,
          senderId:
            platform === 'twitch' && typeof params.senderId === 'string'
              ? params.senderId.trim() || undefined
              : undefined,
        },
      ],
      user: new Types.ObjectId(ctx.userId),
    });

    const session =
      await this.botsLivestreamService.getOrCreateSession(createdBot);

    return this.buildLivestreamBotCreatedResult({
      bot: createdBot,
      brandId: String(brand._id),
      creditsUsed: 0,
      organizationId: ctx.organizationId,
      platform,
      session,
    });
  }

  private async manageLivestreamBot(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    if (!this.botsLivestreamService) {
      return {
        creditsUsed: 0,
        error: 'Livestream bot controls are not available in this environment.',
        success: false,
      };
    }

    const botId = String(params.botId || '').trim();
    const action = String(params.action || '').trim();

    if (!botId || !action) {
      return {
        creditsUsed: 0,
        error: 'botId and action are required.',
        success: false,
      };
    }

    const managed = await this.findLivestreamBotForManagement(botId, ctx);
    if (!managed) {
      return {
        creditsUsed: 0,
        error:
          'Livestream bot not found for the current organization and brand.',
        success: false,
      };
    }

    const requestedPlatform = this.normalizeLivestreamBotPlatform(
      params.platform,
    );
    let nextSession: AgentLivestreamSessionRecord;

    switch (action) {
      case 'start_session':
        nextSession = await this.botsLivestreamService.startSession(
          managed.bot,
        );
        break;
      case 'pause_session':
        nextSession = await this.botsLivestreamService.pauseSession(
          managed.bot,
        );
        break;
      case 'resume_session':
        nextSession = await this.botsLivestreamService.resumeSession(
          managed.bot,
        );
        break;
      case 'stop_session':
        nextSession = await this.botsLivestreamService.stopSession(managed.bot);
        break;
      case 'set_override':
        if (
          typeof params.topic !== 'string' &&
          typeof params.promotionAngle !== 'string' &&
          typeof params.activeLinkId !== 'string'
        ) {
          return {
            creditsUsed: 0,
            error:
              'set_override requires at least one of topic, promotionAngle, or activeLinkId.',
            success: false,
          };
        }

        nextSession = await this.botsLivestreamService.setManualOverride(
          managed.bot,
          {
            activeLinkId:
              typeof params.activeLinkId === 'string'
                ? params.activeLinkId.trim() || undefined
                : undefined,
            promotionAngle:
              typeof params.promotionAngle === 'string'
                ? params.promotionAngle.trim() || undefined
                : undefined,
            topic:
              typeof params.topic === 'string'
                ? params.topic.trim() || undefined
                : undefined,
          },
        );
        break;
      case 'send_now': {
        const sendPlatform =
          requestedPlatform ?? this.inferLivestreamBotPlatform(managed.bot);

        nextSession = await this.botsLivestreamService.sendNow(managed.bot, {
          message:
            typeof params.message === 'string'
              ? params.message.trim() || undefined
              : undefined,
          platform: sendPlatform,
          type:
            params.type === 'scheduled_link_drop' ||
            params.type === 'scheduled_host_prompt' ||
            params.type === 'context_aware_question'
              ? (params.type as LivestreamBotMessageType)
              : undefined,
        });
        break;
      }
      default:
        return {
          creditsUsed: 0,
          error: `Unsupported livestream bot action: ${action}`,
          success: false,
        };
    }

    return this.buildLivestreamBotStatusResult({
      bot: managed.bot,
      creditsUsed: 0,
      platform:
        requestedPlatform ?? this.inferLivestreamBotPlatform(managed.bot),
      session: nextSession,
      statusDescription:
        action === 'set_override'
          ? 'Livestream bot override updated.'
          : action === 'send_now'
            ? 'Livestream bot sent a message immediately.'
            : `Livestream bot action completed: ${action}.`,
    });
  }

  private async createWorkflow(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const hasGraphPayload =
      Array.isArray(params.nodes) ||
      Array.isArray(params.edges) ||
      Array.isArray(params.steps);
    const hasRecurringScaffold =
      typeof params.prompt === 'string' && params.prompt.trim().length > 0;
    const hasNaturalLanguageGenerationRequest =
      !hasGraphPayload &&
      typeof params.description === 'string' &&
      params.description.trim().length > 0;
    const timezone =
      typeof params.timezone === 'string' && params.timezone.trim()
        ? params.timezone.trim()
        : 'UTC';
    const trigger =
      typeof params.trigger === 'string' && params.trigger.trim()
        ? params.trigger
        : WorkflowTrigger.MANUAL;
    const schedule =
      typeof params.schedule === 'string' && params.schedule.trim()
        ? params.schedule.trim()
        : undefined;
    const isScheduleEnabled =
      typeof params.isScheduleEnabled === 'boolean'
        ? params.isScheduleEnabled
        : Boolean(schedule);

    if (hasRecurringScaffold && schedule) {
      return this.createWorkflowFromRecurringScaffold(params, ctx);
    }

    const brand = await this.resolveWorkflowBrand(params, ctx);
    if (!brand) {
      return {
        creditsUsed: 0,
        error:
          'No valid brand is available. Select a brand or refresh your brand context before creating a workflow.',
        success: false,
      };
    }
    const brandId = String(brand._id);
    const brandLabel = String(brand.label || 'your brand');
    const workflowBrandIds = [new Types.ObjectId(brandId)];

    let workflowLabel = String(params.label || params.name || '').trim();
    let description =
      typeof params.description === 'string' ? params.description : undefined;
    let nodes = Array.isArray(params.nodes)
      ? (params.nodes as Array<Record<string, unknown>>)
      : undefined;
    let edges = Array.isArray(params.edges)
      ? (params.edges as Array<Record<string, unknown>>)
      : undefined;

    if (hasNaturalLanguageGenerationRequest) {
      if (!this.workflowGenerationService) {
        return {
          creditsUsed: 0,
          error: 'Workflow generation service is unavailable.',
          success: false,
        };
      }

      const generated =
        await this.workflowGenerationService.generateWorkflowFromDescription({
          description: params.description as string,
          targetPlatforms: Array.isArray(params.targetPlatforms)
            ? (params.targetPlatforms as string[])
            : undefined,
        });

      workflowLabel =
        workflowLabel ||
        String(generated.workflow.name || 'Generated workflow').trim();
      description =
        (typeof generated.workflow.description === 'string'
          ? generated.workflow.description
          : undefined) || description;
      nodes = Array.isArray(generated.workflow.nodes)
        ? (generated.workflow.nodes as Array<Record<string, unknown>>)
        : nodes;
      edges = Array.isArray(generated.workflow.edges)
        ? (generated.workflow.edges as Array<Record<string, unknown>>)
        : edges;
    }

    if (!workflowLabel) {
      return {
        creditsUsed: 0,
        error: 'label is required',
        success: false,
      };
    }

    const normalizedMetadata =
      params.metadata && typeof params.metadata === 'object'
        ? {
            ...(params.metadata as Record<string, unknown>),
            brandId,
            createdFrom: 'agent',
            originatingTool: AgentToolName.CREATE_WORKFLOW,
          }
        : {
            brandId,
            createdFrom: 'agent',
            originatingTool: AgentToolName.CREATE_WORKFLOW,
          };

    const workflow = await this.workflowsService.createWorkflow(
      ctx.userId,
      ctx.organizationId,
      {
        brands: workflowBrandIds,
        description,
        edges,
        inputVariables: Array.isArray(params.inputVariables)
          ? (params.inputVariables as Array<Record<string, unknown>>)
          : undefined,
        isScheduleEnabled,
        label: workflowLabel,
        metadata: normalizedMetadata,
        nodes,
        schedule,
        steps: Array.isArray(params.steps)
          ? (params.steps as Array<Record<string, unknown>>)
          : undefined,
        templateId:
          typeof params.templateId === 'string' ? params.templateId : undefined,
        timezone,
        trigger: trigger as WorkflowTrigger,
      } as never,
    );

    const workflowId = String(
      workflow._id ?? (workflow as Record<string, unknown>).id,
    );
    const nextRunAt =
      schedule && isScheduleEnabled
        ? computeNextRunAtOrThrow(schedule, timezone)
        : null;
    const scheduleSummary =
      schedule && isScheduleEnabled
        ? formatRecurringSchedule(schedule, timezone)
        : undefined;

    return this.buildWorkflowCreatedResult({
      creditsUsed: 0,
      description: description ?? workflowLabel,
      extraData: {
        brandId,
      },
      nextRunAt,
      schedule,
      scheduleSummary,
      successDescription: `Workflow created for ${brandLabel}.`,
      timezone,
      workflowId,
      workflowLabel,
    });
  }

  private async executeWorkflow(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const workflowId = params.workflowId as string;
    const inputValues =
      (params.inputs as Record<string, unknown> | undefined) ??
      (params.inputValues as Record<string, unknown> | undefined) ??
      {};

    const workflow = await this.workflowsService.findOne({
      _id: workflowId,
      isDeleted: false,
      organization: ctx.organizationId,
    });

    if (!workflow) {
      return {
        creditsUsed: 0,
        error: `Workflow ${workflowId} not found`,
        success: false,
      };
    }

    const requiredVars = (workflow.inputVariables ?? []).filter(
      (v) => v.required,
    );
    const missingKeys = requiredVars
      .filter((v) => !(v.key in inputValues))
      .map((v) => v.key);

    if (missingKeys.length > 0) {
      return {
        creditsUsed: 0,
        error: `Missing required workflow inputs: ${missingKeys.join(', ')}. Use get_workflow_inputs to discover expected variables.`,
        success: false,
      };
    }

    const result = await this.workflowExecutorService.executeManualWorkflow(
      workflowId,
      ctx.userId,
      ctx.organizationId,
      inputValues,
    );

    return {
      creditsUsed: 0,
      data: {
        id: result.executionId,
        status: result.status,
      },
      success: true,
    };
  }

  private async getWorkflowInputs(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const workflowId = params.workflowId as string;

    const workflow = await this.workflowsService.findOne({
      _id: workflowId,
      isDeleted: false,
      organization: ctx.organizationId,
    });

    if (!workflow) {
      return {
        creditsUsed: 0,
        error: `Workflow ${workflowId} not found`,
        success: false,
      };
    }

    const inputs = (workflow.inputVariables ?? []).map((v) => ({
      defaultValue: v.defaultValue ?? null,
      description: v.description ?? null,
      key: v.key,
      label: v.label,
      required: v.required ?? false,
      type: v.type,
    }));

    return {
      creditsUsed: 0,
      data: {
        inputs,
        workflowId: String(workflow._id),
        workflowName:
          (workflow as unknown as Record<string, unknown>).name ??
          (workflow as unknown as Record<string, unknown>).label ??
          null,
      },
      success: true,
    };
  }

  // ──────────────────────────────────────────────
  // AI TOOLS — call real LLM services
  // ──────────────────────────────────────────────

  private async aiAction(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const actionMap: Record<string, AiActionType> = {
      'adapt-platform': AiActionType.ADAPT_PLATFORM,
      'add-hashtags': AiActionType.ADD_HASHTAGS,
      'analytics-insight': AiActionType.ANALYTICS_INSIGHT,
      'content-suggest': AiActionType.CONTENT_SUGGEST,
      enhance: AiActionType.ENHANCE_PROMPT,
      'enhance-prompt': AiActionType.ENHANCE_PROMPT,
      expand: AiActionType.EXPAND,
      'explain-metric': AiActionType.EXPLAIN_METRIC,
      'grammar-check': AiActionType.GRAMMAR_CHECK,
      hashtags: AiActionType.ADD_HASHTAGS,
      'hook-generator': AiActionType.HOOK_GENERATOR,
      rewrite: AiActionType.REWRITE,
      'seo-optimize': AiActionType.SEO_OPTIMIZE,
      shorten: AiActionType.SHORTEN,
      'suggest-keywords': AiActionType.SUGGEST_KEYWORDS,
      'tone-adjust': AiActionType.TONE_ADJUST,
      translate: AiActionType.ADAPT_PLATFORM,
    };

    const requestedAction = String(params.action || '')
      .trim()
      .toLowerCase();
    const action = actionMap[requestedAction] ?? AiActionType.ENHANCE_PROMPT;
    const content =
      (params.text as string | undefined) ??
      (params.content as string | undefined) ??
      '';

    const dto: ExecuteAiActionDto = {
      action,
      content,
      context: params.language
        ? { platform: params.language as string }
        : undefined,
    };

    const result: AiActionResult = await this.aiActionsService.execute(
      ctx.organizationId,
      dto,
    );

    return {
      creditsUsed: 1,
      data: { result: result.result, tokensUsed: result.tokensUsed },
      success: true,
    };
  }

  private async generateContent(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const requestedType = String(
      params.type || params.contentType || '',
    ).trim();
    const normalizedType = requestedType.toLowerCase();
    const shouldGenerateArticle =
      normalizedType === 'article' ||
      normalizedType === 'x-article' ||
      params.longForm === true;

    if (shouldGenerateArticle) {
      const articleType =
        normalizedType === 'x-article' ? 'x-article' : 'standard';
      const response = await this.callInternalApi(
        'POST',
        '/v1/articles/generate',
        {
          count: articleType === 'standard' ? 1 : undefined,
          generateHeaderImage:
            articleType === 'x-article'
              ? Boolean(params.generateHeaderImage ?? true)
              : undefined,
          keywords: Array.isArray(params.keywords)
            ? (params.keywords as string[])
            : undefined,
          ...(ctx.generationModelOverride
            ? { model: ctx.generationModelOverride }
            : {}),
          prompt: (params.topic as string) || (params.prompt as string) || '',
          targetWordCount:
            articleType === 'x-article'
              ? (params.targetWordCount as number | undefined)
              : undefined,
          tone:
            articleType === 'x-article'
              ? (params.tone as string | undefined)
              : undefined,
          type: articleType,
        },
        ctx,
      );

      const data = (response.data ?? response) as Record<string, unknown>;
      const attributes = (data.attributes ?? data) as Record<string, unknown>;
      const articleId =
        (data.id as string | undefined) ||
        (attributes.id as string | undefined);

      return {
        creditsUsed: 2,
        data: {
          articleId,
          content: (attributes.content as string) || '',
          summary: (attributes.summary as string) || '',
          title: (attributes.label as string) || '',
          type: articleType,
        },
        nextActions: articleId
          ? [
              {
                ctas: [
                  {
                    href: `/content/articles/${articleId}`,
                    label: 'Open article',
                  },
                ],
                description:
                  articleType === 'x-article'
                    ? 'X Article generated with review cycle.'
                    : 'Article generated with review cycle.',
                id: `article-gen-${articleId}`,
                title:
                  articleType === 'x-article'
                    ? 'X Article generated'
                    : 'Article generated',
                type: 'content_preview_card',
              },
            ]
          : [],
        success: true,
      };
    }

    const results = await this.contentGeneratorService.generateContent(
      new Types.ObjectId(ctx.organizationId),
      {
        additionalContext: params.additionalContext as string[] | undefined,
        brandId: params.brandId
          ? new Types.ObjectId(params.brandId as string)
          : undefined,
        platform: params.platform as string,
        topic: params.topic as string,
        variationsCount: 1,
      } as never,
    );

    const generated = results[0];

    return {
      creditsUsed: 2,
      data: {
        content: generated?.content ?? '',
        hashtags: generated?.hashtags ?? [],
        hook: generated?.hook,
        patternUsed: generated?.patternUsed,
      },
      success: true,
    };
  }

  // ──────────────────────────────────────────────
  // GENERATION TOOLS — call ingredient creation endpoints
  // Provider-agnostic (Replicate, fal, genfeedai, ElevenLabs, etc.)
  // Credits handled by the endpoint's CreditsInterceptor.
  // ──────────────────────────────────────────────

  private async generateImage(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    // Call the real POST /v1/images endpoint which handles:
    // - Model selection (auto or default)
    // - Provider routing (Replicate, ComfyUI, etc.)
    // - Credit deduction via CreditsInterceptor
    // - Synchronous polling (3min timeout, 2s interval)

    const prompt =
      (params.prompt as string | undefined) ??
      (params.description as string | undefined) ??
      (params.text as string | undefined) ??
      '';
    const aspectRatio = (params.aspectRatio as string) || '1:1';
    const dimensions = this.aspectRatioToDimensions(aspectRatio);
    const promptPreview = prompt.substring(0, 80);

    // Use attachment as reference image when no explicit imageUrl is provided
    const imageUrl =
      (params.imageUrl as string | undefined) ||
      (ctx.attachmentUrls?.length ? ctx.attachmentUrls[0] : undefined);

    const body: Record<string, unknown> = {
      height: dimensions.height,
      prompt,
      text: prompt,
      waitForCompletion: true,
      width: dimensions.width,
      ...(ctx.runId ? { agentRunId: ctx.runId } : {}),
      ...(ctx.strategyId ? { agentStrategyId: ctx.strategyId } : {}),
      ...(imageUrl ? { references: [imageUrl] } : {}),
    };

    if (ctx.generationModelOverride) {
      body.model = ctx.generationModelOverride;
    } else {
      body.autoSelectModel = true;
      body.prioritize = ctx.generationPriority || 'quality';
    }

    let response: Record<string, unknown>;
    try {
      response = await this.callInternalApi('POST', '/v1/images', body, ctx);
    } catch (error) {
      // Graceful timeout handling: if the 3-minute polling times out or
      // the endpoint errors, return a partial result with a gallery link
      this.loggerService.warn(
        `generateImage failed for org=${ctx.organizationId}: ${(error as Error).message}`,
      );

      return {
        creditsUsed: 0,
        data: { status: Status.PROCESSING },
        nextActions: [
          {
            ctas: [{ href: '/library/images', label: 'Check gallery' }],
            description: `Image is still processing: "${promptPreview}"`,
            id: `image-gen-pending-${Date.now()}`,
            title: 'Image processing',
            type: 'content_preview_card',
          },
        ],
        success: true,
      };
    }

    const id =
      (response.data as Record<string, unknown>)?.id ??
      (response as Record<string, unknown>).id;
    const cdnUrl = id
      ? `${this.configService.ingredientsEndpoint}/images/${id}`
      : undefined;

    // Fire-and-forget quality check — don't block the generation response
    if (id && this.contentQualityScorerService) {
      this.contentQualityScorerService
        .scoreAndTag(String(id), 'image', {
          organizationId: ctx.organizationId,
        })
        .catch((err) =>
          this.loggerService.error('Auto quality check failed for image', err),
        );
    }

    if (id) {
      await this.completeJourneyMission(ctx, 'generate_first_image');
    }

    const onboardingStatus = await this.checkOnboardingStatus(ctx);

    return {
      creditsUsed: 0, // endpoint handles credits via CreditsInterceptor
      data: { id, status: Status.GENERATED, url: cdnUrl },
      nextActions: id
        ? [
            {
              ctas: [{ href: `/g/image/${id}`, label: 'View in gallery' }],
              description: `Image generated from: "${promptPreview}"`,
              id: `image-gen-${id}`,
              images: cdnUrl ? [cdnUrl] : [],
              title: 'Image generated',
              type: 'content_preview_card',
            },
            ...(onboardingStatus.nextActions ?? []),
          ]
        : [],
      success: true,
    };
  }

  private async reframeImage(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const imageId = String(params.imageId || '');
    const aspectRatio = String(params.aspectRatio || '1:1');
    const dimensions = this.aspectRatioToDimensions(aspectRatio);

    const response = await this.callInternalApi(
      'POST',
      `/images/${imageId}/reframe`,
      {
        format:
          aspectRatio === '1:1'
            ? 'square'
            : aspectRatio === '9:16' || aspectRatio === '3:4'
              ? 'portrait'
              : 'landscape',
        height: dimensions.height,
        text: `Reframe to ${aspectRatio}`,
        waitForCompletion: true,
        width: dimensions.width,
      },
      ctx,
    );

    const id =
      (response.data as Record<string, unknown>)?.id ??
      (response as Record<string, unknown>).id;
    const cdnUrl = id
      ? `${this.configService.ingredientsEndpoint}/images/${id}`
      : undefined;

    return {
      creditsUsed: 0,
      data: { id, sourceImageId: imageId, status: Status.GENERATED },
      nextActions: id
        ? [
            {
              ctas: [{ href: `/g/image/${id}`, label: 'View in gallery' }],
              description: `Reframed to ${aspectRatio}`,
              id: `image-reframe-${id}`,
              images: cdnUrl ? [cdnUrl] : [],
              title: 'Image reframed',
              type: 'content_preview_card',
            },
          ]
        : [],
      success: true,
    };
  }

  private async upscaleImage(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    // Image upscale goes through the same images endpoint
    // with a specific upscale model

    const body = {
      model: 'replicate-topaz-video-upscale',
      prompt: 'upscale',
      referenceImages: [params.imageUrl as string],
      text: 'upscale',
      waitForCompletion: true,
    };

    const response = await this.callInternalApi(
      'POST',
      '/v1/images',
      body,
      ctx,
    );

    const id =
      (response.data as Record<string, unknown>)?.id ??
      (response as Record<string, unknown>).id;
    const cdnUrl = id
      ? `${this.configService.ingredientsEndpoint}/images/${id}`
      : undefined;

    return {
      creditsUsed: 0, // endpoint handles credits
      data: { id, status: Status.GENERATED, url: cdnUrl },
      nextActions: id
        ? [
            {
              ctas: [{ href: `/g/image/${id}`, label: 'View in gallery' }],
              description: 'Image upscaled',
              id: `image-upscale-${id}`,
              images: cdnUrl ? [cdnUrl] : [],
              title: 'Image upscaled',
              type: 'content_preview_card',
            },
          ]
        : [],
      success: true,
    };
  }

  private async generateVideo(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const aspectRatio = (params.aspectRatio as string) || '16:9';
    const dimensions = this.aspectRatioToDimensions(aspectRatio);
    const duration = (params.duration as number) || 10;
    // Fall back to first chat attachment when no explicit imageUrl is provided
    const imageUrl =
      (params.imageUrl as string | undefined) ||
      (ctx.attachmentUrls?.length ? ctx.attachmentUrls[0] : undefined);
    const audioUrl = params.audioUrl as string | undefined;

    const body: Record<string, unknown> = {
      duration,
      height: dimensions.height,
      prompt: params.prompt as string,
      text: params.prompt as string,
      waitForCompletion: true,
      width: dimensions.width,
      ...(ctx.runId ? { agentRunId: ctx.runId } : {}),
      ...(ctx.strategyId ? { agentStrategyId: ctx.strategyId } : {}),
    };

    // Avatar mode: image + audio → Kling Avatar V2 (skip autoSelectModel)
    if (audioUrl && imageUrl) {
      body.model = 'kwaivgi/kling-avatar-v2';
      body.audioUrl = audioUrl;
      body.references = [imageUrl];
    } else if (ctx.generationModelOverride) {
      body.model = ctx.generationModelOverride;
      if (imageUrl) {
        body.references = [imageUrl];
      }
    } else if (imageUrl) {
      body.autoSelectModel = true;
      body.prioritize = ctx.generationPriority || 'quality';
      body.references = [imageUrl];
    } else {
      body.autoSelectModel = true;
      body.prioritize = ctx.generationPriority || 'quality';
    }

    const response = await this.callInternalApi(
      'POST',
      '/v1/videos',
      body,
      ctx,
    );

    const id =
      (response.data as Record<string, unknown>)?.id ??
      (response as Record<string, unknown>).id;
    const cdnUrl = id
      ? `${this.configService.ingredientsEndpoint}/videos/${id}`
      : undefined;

    // Fire-and-forget quality check — don't block the generation response
    if (id && this.contentQualityScorerService) {
      this.contentQualityScorerService
        .scoreAndTag(String(id), 'video', {
          organizationId: ctx.organizationId,
        })
        .catch((err) =>
          this.loggerService.error('Auto quality check failed for video', err),
        );
    }

    if (id) {
      await this.completeJourneyMission(ctx, 'generate_first_video');
    }

    const onboardingStatus = await this.checkOnboardingStatus(ctx);

    return {
      creditsUsed: 0,
      data: { id, status: Status.GENERATED, url: cdnUrl },
      nextActions: id
        ? [
            {
              ctas: [{ href: `/g/video/${id}`, label: 'View in gallery' }],
              description: `Video generated from: "${(params.prompt as string).substring(0, 80)}"`,
              id: `video-gen-${id}`,
              title: 'Video generated',
              type: 'content_preview_card',
              videos: cdnUrl ? [cdnUrl] : [],
            },
            ...(onboardingStatus.nextActions ?? []),
          ]
        : [],
      success: true,
    };
  }

  private async generateMusic(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const duration = (params.duration as number) || 10;

    const body: Record<string, unknown> = {
      autoSelectModel: true,
      duration,
      text: params.text as string,
      waitForCompletion: true,
      ...(ctx.runId ? { agentRunId: ctx.runId } : {}),
      ...(ctx.strategyId ? { agentStrategyId: ctx.strategyId } : {}),
    };

    const response = await this.callInternalApi(
      'POST',
      '/v1/musics',
      body,
      ctx,
    );

    const id =
      (response.data as Record<string, unknown>)?.id ??
      (response as Record<string, unknown>).id;
    const cdnUrl = id
      ? `${this.configService.ingredientsEndpoint}/musics/${id}`
      : undefined;

    return {
      creditsUsed: 0,
      data: { id, status: Status.GENERATED, url: cdnUrl },
      nextActions: id
        ? [
            {
              audio: cdnUrl ? [cdnUrl] : [],
              ctas: [{ href: `/g/music/${id}`, label: 'View in gallery' }],
              description: `Music generated from: "${(params.text as string).substring(0, 80)}"`,
              id: `music-gen-${id}`,
              title: 'Music generated',
              type: 'content_preview_card',
            },
          ]
        : [],
      success: true,
    };
  }

  private async generateVoice(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const body = {
      text: params.text as string,
      voiceId: params.voiceId as string,
      waitForCompletion: true,
    };

    const response = await this.callInternalApi(
      'POST',
      '/v1/voices/generate',
      body,
      ctx,
    );

    const id =
      (response.data as Record<string, unknown>)?.id ??
      (response as Record<string, unknown>).id;
    const audioUrl =
      (response.data as Record<string, unknown>)?.audioUrl ??
      (response as Record<string, unknown>).audioUrl;
    const cdnUrl = audioUrl
      ? String(audioUrl)
      : id
        ? `${this.configService.ingredientsEndpoint}/voices/${id}`
        : undefined;

    return {
      creditsUsed: 0,
      data: { id, status: Status.GENERATED, url: cdnUrl },
      nextActions: id
        ? [
            {
              audio: cdnUrl ? [cdnUrl] : [],
              ctas: [{ href: `/g/voice/${id}`, label: 'View in gallery' }],
              description: `Speech generated: "${(params.text as string).substring(0, 80)}"`,
              id: `voice-gen-${id}`,
              title: 'Voice generated',
              type: 'content_preview_card',
            },
          ]
        : [],
      success: true,
    };
  }

  private async openStudioHandoff(
    params: Record<string, unknown>,
  ): Promise<AgentToolResult> {
    const ingredientId = params.ingredientId
      ? String(params.ingredientId)
      : null;
    const type = String(params.type || 'image');
    const href = ingredientId
      ? `/g/${type}/${ingredientId}`
      : `/studio?type=${type}`;

    return {
      creditsUsed: 0,
      data: { href, ingredientId, type },
      nextActions: [
        {
          ctas: [{ href, label: 'Open in Studio' }],
          data: { href, ingredientId, type },
          id: `studio-handoff-${Date.now()}`,
          title: 'Continue in Studio',
          type: 'image_transform_card',
        },
      ],
      success: true,
    };
  }

  // ──────────────────────────────────────────────
  // BATCH TOOLS
  // ──────────────────────────────────────────────

  private async generateContentBatch(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    if (!this.batchGenerationService) {
      return {
        creditsUsed: 0,
        error: 'Batch generation service not available',
        success: false,
      };
    }

    let brandId =
      (params.brandId as string | undefined) ?? ctx.brandId ?? undefined;
    const handle = params.handle as string | undefined;

    // Resolve @handle to brandId if provided
    if (handle && !brandId && this.credentialsService) {
      const credential = await this.credentialsService.findByHandle(
        handle,
        ctx.organizationId,
      );

      if (credential) {
        brandId = String(credential.brand);
      } else {
        return {
          creditsUsed: 0,
          error: `No connected credential found for handle "${handle}"`,
          success: false,
        };
      }
    }

    if (!brandId) {
      const selectedBrand = await this.brandsService.findOne({
        isDeleted: false,
        isSelected: true,
        organization: new Types.ObjectId(ctx.organizationId),
        user: new Types.ObjectId(ctx.userId),
      } as never);

      if (selectedBrand?._id) {
        brandId = String(selectedBrand._id);
      }
    }

    if (!brandId) {
      return {
        creditsUsed: 0,
        error: 'brandId or handle is required',
        success: false,
      };
    }

    const dateRange = (params.dateRange as Record<string, string>) || {
      end: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      start: new Date().toISOString(),
    };

    const batch = await this.batchGenerationService.createBatch(
      {
        brandId,
        contentMix: params.contentMix as never,
        count: (params.count as number) || 10,
        dateRange: {
          end: dateRange.end,
          start: dateRange.start,
        },
        platforms: (params.platforms as string[]) || ['instagram'],
        style: params.style as string | undefined,
        topics: params.topics as string[] | undefined,
      },
      ctx.userId,
      ctx.organizationId,
    );

    const batchId = String(batch.id);
    const totalCount = batch.totalCount;
    const platforms = (params.platforms as string[]) || ['instagram'];
    const platformLabel = this.formatBatchPlatformsLabel(platforms);
    const streamedItems: Array<{
      error?: string;
      index: number;
      platform?: string;
      postId?: string;
      previewText?: string;
      status: 'completed' | 'failed';
      topic: string;
    }> = [];

    if (ctx.streamBatchToUser && ctx.threadId && ctx.userId) {
      let streamedTranscript =
        `Creating ${totalCount} ${platformLabel} post${totalCount === 1 ? '' : 's'}. ` +
        `I will stream each draft as soon as it is ready.`;

      await runEffectPromise(
        this.publishTokenEffect({
          runId: ctx.runId,
          threadId: ctx.threadId,
          token: streamedTranscript,
          userId: ctx.userId,
        }),
      );

      await runEffectPromise(
        this.publishWorkEventEffect({
          detail: `Queued ${totalCount} post${totalCount === 1 ? '' : 's'} for generation.`,
          event: 'started',
          label: 'Batch generation started',
          progress: 0,
          runId: ctx.runId,
          startedAt: new Date().toISOString(),
          status: 'running',
          threadId: ctx.threadId,
          userId: ctx.userId,
        }),
      );

      const summary = await this.batchGenerationService.processBatch(
        batchId,
        ctx.organizationId,
        {
          onItemCompleted: async ({
            completedCount,
            index,
            item,
            postId,
            previewText,
            topic,
            totalCount: total,
          }) => {
            const block =
              `\n\nPost ${index + 1}/${total} ready` +
              `${item.platform ? ` (${item.platform})` : ''}` +
              `\n${(previewText || topic).trim()}`;
            streamedTranscript += block;
            streamedItems.push({
              index,
              platform: item.platform,
              postId,
              previewText,
              status: 'completed',
              topic,
            });

            await runEffectPromise(
              this.publishWorkEventEffect({
                detail: `Draft ${completedCount}/${total} is ready.`,
                event: 'tool_completed',
                label: `Generated post ${index + 1}`,
                parameters: {
                  batchId,
                  platform: item.platform,
                  postId,
                  previewText,
                  topic,
                },
                progress: Math.round((completedCount / total) * 100),
                resultSummary: previewText || topic,
                runId: ctx.runId,
                status: 'completed',
                threadId: ctx.threadId!,
                toolName: AgentToolName.GENERATE_CONTENT_BATCH,
                userId: ctx.userId!,
              }),
            );
            await runEffectPromise(
              this.publishTokenEffect({
                runId: ctx.runId,
                threadId: ctx.threadId!,
                token: block,
                userId: ctx.userId!,
              }),
            );
          },
          onItemFailed: async ({
            failedCount,
            index,
            item,
            error,
            topic,
            totalCount: total,
          }) => {
            const block =
              `\n\nPost ${index + 1}/${total} failed` +
              `${item.platform ? ` (${item.platform})` : ''}` +
              `\n${error || 'Unknown error'}`;
            streamedTranscript += block;
            streamedItems.push({
              error,
              index,
              platform: item.platform,
              status: 'failed',
              topic,
            });

            await runEffectPromise(
              this.publishWorkEventEffect({
                detail: error || 'Draft generation failed.',
                event: 'tool_completed',
                label: `Failed post ${index + 1}`,
                parameters: {
                  batchId,
                  platform: item.platform,
                  topic,
                },
                progress: Math.round(
                  ((failedCount +
                    streamedItems.filter(
                      (entry) => entry.status === 'completed',
                    ).length) /
                    total) *
                    100,
                ),
                resultSummary: error || 'Unknown error',
                runId: ctx.runId,
                status: 'failed',
                threadId: ctx.threadId!,
                toolName: AgentToolName.GENERATE_CONTENT_BATCH,
                userId: ctx.userId!,
              }),
            );
            await runEffectPromise(
              this.publishTokenEffect({
                runId: ctx.runId,
                threadId: ctx.threadId!,
                token: block,
                userId: ctx.userId!,
              }),
            );
          },
          onItemStarted: async ({
            completedCount,
            failedCount,
            index,
            item,
            totalCount: total,
          }) => {
            await runEffectPromise(
              this.publishWorkEventEffect({
                detail: `Generating draft ${index + 1}/${total}.`,
                event: 'tool_started',
                label: `Generating post ${index + 1}`,
                parameters: {
                  batchId,
                  format: item.format,
                  platform: item.platform,
                },
                progress: Math.round(
                  ((completedCount + failedCount) / Math.max(total, 1)) * 100,
                ),
                runId: ctx.runId,
                status: 'running',
                threadId: ctx.threadId!,
                toolName: AgentToolName.GENERATE_CONTENT_BATCH,
                userId: ctx.userId!,
              }),
            );
          },
        },
      );

      const summaryText =
        `\n\nBatch complete. ${summary.completedCount} of ${summary.totalCount} ` +
        `post${summary.totalCount === 1 ? '' : 's'} ready` +
        `${summary.failedCount > 0 ? `, ${summary.failedCount} failed.` : '.'}`;
      streamedTranscript += summaryText;
      await runEffectPromise(
        this.publishTokenEffect({
          runId: ctx.runId,
          threadId: ctx.threadId,
          token: summaryText,
          userId: ctx.userId,
        }),
      );

      return {
        creditsUsed: 5,
        data: {
          batchId,
          completedCount: summary.completedCount,
          failedCount: summary.failedCount,
          message:
            summary.failedCount > 0
              ? `Batch finished with ${summary.completedCount} ready and ${summary.failedCount} failed.`
              : `Batch finished with ${summary.completedCount} generated post${summary.completedCount === 1 ? '' : 's'}.`,
          status: summary.status,
          streamedItems,
          streamedTranscript,
          totalCount: summary.totalCount,
        },
        nextActions: [
          {
            batchCount: totalCount,
            ctas: [
              { href: '/review', label: 'Open Review Queue' },
              { href: '/calendar/posts', label: 'Open Calendar' },
            ],
            description: `Generated ${totalCount} ${platformLabel} draft${totalCount === 1 ? '' : 's'}.`,
            id: `batch-generation-${batchId}`,
            title: 'Batch generation complete',
            type: 'batch_generation_card',
          },
        ],
        success: true,
      };
    }

    // Trigger async processing
    this.batchGenerationService
      .processBatch(batchId, ctx.organizationId, {
        onBatchStarted: async ({ batchId: currentBatchId, totalCount }) => {
          await runEffectPromise(
            this.publishWorkEventEffect({
              detail: `Queued ${totalCount} post${totalCount === 1 ? '' : 's'} for generation.`,
              event: 'started',
              label: 'Batch generation started',
              progress: 0,
              runId: ctx.runId,
              startedAt: new Date().toISOString(),
              status: 'running',
              threadId: ctx.threadId!,
              toolCallId: `batch:${currentBatchId}`,
              toolName: AgentToolName.GENERATE_CONTENT_BATCH,
              userId: ctx.userId!,
            }),
          );
        },
        onItemCompleted: async ({
          completedCount,
          index,
          item,
          postId,
          previewText,
          topic,
          totalCount: total,
        }) => {
          await runEffectPromise(
            this.publishWorkEventEffect({
              detail: `Draft ${completedCount}/${total} is ready.`,
              event: 'tool_completed',
              label: `Generated post ${index + 1}`,
              parameters: {
                batchId,
                platform: item.platform,
                postId,
                previewText,
                topic,
              },
              progress: Math.round((completedCount / total) * 100),
              resultSummary: previewText || topic,
              runId: ctx.runId,
              status: 'completed',
              threadId: ctx.threadId!,
              toolCallId: `batch:${batchId}:item:${String(item._id)}`,
              toolName: AgentToolName.GENERATE_CONTENT_BATCH,
              userId: ctx.userId!,
            }),
          );
        },
        onItemFailed: async ({
          completedCount,
          failedCount,
          index,
          item,
          error,
          topic,
          totalCount: total,
        }) => {
          await runEffectPromise(
            this.publishWorkEventEffect({
              detail: error || 'Draft generation failed.',
              event: 'tool_completed',
              label: `Failed post ${index + 1}`,
              parameters: {
                batchId,
                platform: item.platform,
                topic,
              },
              progress: Math.round(
                ((completedCount + failedCount) / Math.max(total, 1)) * 100,
              ),
              resultSummary: error || 'Unknown error',
              runId: ctx.runId,
              status: 'failed',
              threadId: ctx.threadId!,
              toolCallId: `batch:${batchId}:item:${String(item._id)}`,
              toolName: AgentToolName.GENERATE_CONTENT_BATCH,
              userId: ctx.userId!,
            }),
          );
        },
        onItemStarted: async ({
          completedCount,
          failedCount,
          index,
          item,
          totalCount: total,
        }) => {
          await runEffectPromise(
            this.publishWorkEventEffect({
              detail: `Generating draft ${index + 1}/${total}.`,
              event: 'tool_started',
              label: `Generating post ${index + 1}`,
              parameters: {
                batchId,
                format: item.format,
                platform: item.platform,
              },
              progress: Math.round(
                ((completedCount + failedCount) / Math.max(total, 1)) * 100,
              ),
              runId: ctx.runId,
              status: 'running',
              threadId: ctx.threadId!,
              toolCallId: `batch:${batchId}:item:${String(item._id)}`,
              toolName: AgentToolName.GENERATE_CONTENT_BATCH,
              userId: ctx.userId!,
            }),
          );
        },
      })
      .catch((err: Error) => {
        this.loggerService.error(
          `Batch processing failed: ${err.message}`,
          this.constructorName,
        );
      });

    return {
      creditsUsed: 5,
      data: {
        batchId,
        message: `Batch created with ${batch.totalCount} items. Processing started.`,
        status: batch.status,
        totalCount: batch.totalCount,
      },
      success: true,
    };
  }

  private formatBatchPlatformsLabel(platforms: string[]): string {
    if (platforms.length === 0) {
      return 'content';
    }

    if (platforms.length === 1) {
      return platforms[0] === 'twitter' ? 'X' : platforms[0];
    }

    return platforms
      .map((platform) => (platform === 'twitter' ? 'X' : platform))
      .join(', ');
  }

  private async resolveHandle(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    if (!this.credentialsService) {
      return {
        creditsUsed: 0,
        error: 'Credentials service not available',
        success: false,
      };
    }

    const handle = params.handle as string;

    if (!handle) {
      return {
        creditsUsed: 0,
        error: 'handle parameter is required',
        success: false,
      };
    }

    const credential = await this.credentialsService.findByHandle(
      handle,
      ctx.organizationId,
    );

    if (!credential) {
      return {
        creditsUsed: 0,
        error: `No connected credential found for handle "${handle}"`,
        success: false,
      };
    }

    return {
      creditsUsed: 0,
      data: {
        brandId: String(credential.brand),
        credentialId: String(credential._id),
        externalHandle: credential.externalHandle,
        externalName: credential.externalName,
        platform: credential.platform,
      },
      success: true,
    };
  }

  private async listReviewQueue(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    if (!this.batchGenerationService) {
      return {
        creditsUsed: 0,
        error: 'Batch generation service not available',
        success: false,
      };
    }

    const batchId = this.normalizeBatchIdParam(params.batchId);
    const limit = (params.limit as number) || 20;

    if (params.batchId != null && !batchId) {
      return {
        creditsUsed: 0,
        error: 'batchId must be a 24 character hex string',
        success: false,
      };
    }

    if (batchId) {
      const batch = await this.batchGenerationService.getBatch(
        batchId,
        ctx.organizationId,
      );

      if (!batch) {
        return {
          creditsUsed: 0,
          error: `Batch ${batchId} not found`,
          success: false,
        };
      }

      const statusFilter = params.status as string | undefined;
      let items = batch.items || [];

      if (statusFilter) {
        items = items.filter(
          (item: unknown) =>
            (item as Record<string, unknown>).status === statusFilter,
        );
      }

      const visibleItems = items.slice(0, limit).map((item) => {
        const reviewItem = item as unknown as Record<string, unknown>;
        return {
          caption: reviewItem.caption,
          format: reviewItem.format,
          id: String(reviewItem._id),
          mediaUrl: reviewItem.mediaUrl,
          platform: reviewItem.platform,
          reviewDecision:
            typeof reviewItem.reviewDecision === 'string'
              ? reviewItem.reviewDecision
              : undefined,
          scheduledDate: reviewItem.scheduledDate,
          status: reviewItem.status,
        };
      });

      const readyCount = items.filter((item: unknown) => {
        const reviewItem = item as Record<string, unknown>;
        return (
          reviewItem.reviewDecision !== 'approved' &&
          reviewItem.reviewDecision !== 'rejected' &&
          reviewItem.status !== 'failed'
        );
      }).length;
      const summaryText =
        visibleItems.length === 0
          ? 'This batch does not have any items in the current filter.'
          : `Loaded ${visibleItems.length} item${visibleItems.length === 1 ? '' : 's'} from this batch. ${readyCount} item${readyCount === 1 ? ' is' : 's are'} ready for review right now.`;
      const outcomeBullets = visibleItems.slice(0, 4).map((item) => {
        const platformLabel = this.formatQueueItemLabel(item.platform);
        const formatLabel =
          typeof item.format === 'string' ? item.format : null;
        const statusLabel =
          item.reviewDecision ??
          (typeof item.status === 'string' ? item.status : null);

        return [platformLabel, formatLabel, statusLabel]
          .filter((value): value is string => Boolean(value))
          .join(' · ');
      });

      return {
        creditsUsed: 0,
        data: {
          batchId: String(batch.id),
          batchStatus: batch.status,
          items: visibleItems,
          totalCount: batch.totalCount,
        },
        nextActions: [
          {
            id: `review-queue-${String(batch.id)}`,
            outcomeBullets,
            primaryCta: {
              href: `/posts/review?batch=${String(batch.id)}&filter=ready`,
              label: 'Open review queue',
            },
            status: 'completed',
            summaryText,
            title: 'Review queue loaded',
            type: 'completion_summary_card',
          },
        ],
        success: true,
      };
    }

    // List recent batches
    const result = await this.batchGenerationService.getBatches(
      ctx.organizationId,
      { limit },
    );

    return {
      creditsUsed: 0,
      data: {
        batches: result.items.map((b) => ({
          completedCount: b.completedCount,
          failedCount: b.failedCount,
          id: b.id,
          pendingCount: b.pendingCount,
          status: b.status,
          totalCount: b.totalCount,
        })),
        total: result.total,
      },
      success: true,
    };
  }

  private async batchApproveReject(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    if (!this.batchGenerationService) {
      return {
        creditsUsed: 0,
        error: 'Batch generation service not available',
        success: false,
      };
    }

    const batchId = this.normalizeBatchIdParam(params.batchId);
    const itemIds = params.itemIds as string[];
    const action = params.action as string;

    if (!batchId || !itemIds?.length || !action) {
      return {
        creditsUsed: 0,
        error: 'batchId, itemIds, and action are required',
        success: false,
      };
    }

    if (action === 'approve') {
      await this.batchGenerationService.approveItems(
        batchId,
        itemIds,
        ctx.organizationId,
      );
    } else {
      await this.batchGenerationService.rejectItems(
        batchId,
        itemIds,
        ctx.organizationId,
      );
    }

    return {
      creditsUsed: 1,
      data: {
        action,
        batchId,
        itemCount: itemIds.length,
      },
      success: true,
    };
  }

  private normalizeBatchIdParam(value: unknown): string | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }

    const normalized = value
      .trim()
      .replace(/^batch\s*id\s*/i, '')
      .replace(/^[:#\s-]+/, '')
      .trim();

    if (!normalized || !Types.ObjectId.isValid(normalized)) {
      return undefined;
    }

    return normalized;
  }

  private formatQueueItemLabel(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const normalized = value.trim().toLowerCase();

    if (!normalized) {
      return null;
    }

    if (normalized === 'twitter' || normalized === 'x') {
      return 'X';
    }

    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
  }

  private buildTrendsSummaryCard(
    platform: string | undefined,
    trends: Record<string, unknown>[],
  ) {
    const normalizedPlatform =
      typeof platform === 'string' ? platform.trim().toLowerCase() : '';
    const platformLabel =
      normalizedPlatform === 'tiktok'
        ? 'TikTok'
        : normalizedPlatform === 'youtube'
          ? 'YouTube'
          : normalizedPlatform === 'linkedin'
            ? 'LinkedIn'
            : this.formatQueueItemLabel(platform);
    const trendCount = trends.length;
    const title =
      trendCount === 0
        ? `${platformLabel ? `${platformLabel} trends` : 'Trends'} unavailable`
        : `${platformLabel ? `${platformLabel} trends` : 'Trends'} loaded`;
    const summaryText =
      trendCount === 0
        ? `No ${platformLabel ? `${platformLabel} trends` : 'trends'} are available in the cached corpus right now. Open trends analytics to confirm source coverage before retrying this task.`
        : `Loaded ${trendCount} ${platformLabel ? `${platformLabel} ` : ''}trend${trendCount === 1 ? '' : 's'} from the cached corpus. Open trends analytics to review the strongest hooks and decide what to remix.`;

    const outcomeBullets =
      trendCount === 0
        ? [
            `${platformLabel ? `${platformLabel} cached corpus` : 'Cached corpus'} returned 0 trends`,
            'Live fetch fallback is disabled for this tool',
          ]
        : trends.slice(0, 4).map((trend) => {
            const topic =
              typeof trend.topic === 'string' && trend.topic.trim().length > 0
                ? trend.topic.trim()
                : typeof trend.name === 'string' && trend.name.trim().length > 0
                  ? trend.name.trim()
                  : 'Untitled trend';
            const score =
              typeof trend.score === 'number' && Number.isFinite(trend.score)
                ? `score ${Math.round(trend.score)}`
                : null;

            return [topic, score]
              .filter((value): value is string => Boolean(value))
              .join(' · ');
          });

    return {
      id: `trends-${(platform ?? 'all').trim().toLowerCase() || 'all'}-${Date.now()}`,
      outcomeBullets,
      primaryCta: {
        href: '/analytics/trends',
        label: 'Open trends analytics',
      },
      status: 'completed' as const,
      summaryText,
      title,
      type: 'completion_summary_card' as const,
    };
  }

  // ──────────────────────────────────────────────
  // PROACTIVE AGENT TOOLS
  // ──────────────────────────────────────────────

  private async discoverEngagements(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const keywords = params.keywords as string[];
    const platform = params.platform as string;
    const limit = (params.limit as number) || 20;

    if (!keywords?.length || !platform) {
      return {
        creditsUsed: 0,
        error: 'keywords and platform are required',
        success: false,
      };
    }

    // Use internal API to search for tweets/posts matching keywords
    const query = keywords.join(' OR ');

    try {
      const response = await this.callInternalApi(
        'GET',
        `/v1/trends/search?q=${encodeURIComponent(query)}&platform=${platform}&limit=${limit}`,
        undefined,
        ctx,
      );

      const results = (response.results ?? response.data ?? []) as Record<
        string,
        unknown
      >[];

      return {
        creditsUsed: 1,
        data: {
          count: results.length,
          platform,
          posts: results
            .slice(0, limit)
            .map((post: Record<string, unknown>) => ({
              author: post.author ?? post.username,
              content: post.content ?? post.text,
              engagement: post.engagement ?? post.likes,
              id: String(post.id ?? post.externalId),
              url: post.url,
            })),
          query,
        },
        success: true,
      };
    } catch {
      // Fallback: return empty results if search endpoint not available
      return {
        creditsUsed: 1,
        data: {
          count: 0,
          message:
            'Engagement discovery search returned no results. The search endpoint may not be configured for this platform yet.',
          platform,
          posts: [],
          query,
        },
        success: true,
      };
    }
  }

  private async draftEngagementReply(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    if (!this.batchGenerationService) {
      return {
        creditsUsed: 0,
        error: 'Batch generation service not available',
        success: false,
      };
    }

    const targetPostId = params.targetPostId as string;
    const replyContent = params.replyContent as string;
    const platform = params.platform as string;

    if (!targetPostId || !replyContent || !platform) {
      return {
        creditsUsed: 0,
        error: 'targetPostId, replyContent, and platform are required',
        success: false,
      };
    }

    // Create a batch with a single engagement item
    const brandId = params.brandId as string | undefined;

    const batchData: Record<string, unknown> = {
      brandId: brandId || undefined,
      count: 1,
      platforms: [platform],
      source: 'proactive',
    };

    const batch = await this.batchGenerationService.createBatch(
      batchData as never,
      ctx.userId,
      ctx.organizationId,
    );

    // Add the engagement item directly
    const batchId = String(batch.id);
    await this.callInternalApi(
      'POST',
      `/v1/batches/${batchId}/items`,
      {
        caption: replyContent,
        platform,
        status: 'pending',
        targetAuthor: params.targetAuthor,
        targetPostContent: params.targetPostContent,
        targetPostId,
        targetPostUrl: params.targetPostUrl,
        type: 'engagement',
      },
      ctx,
    ).catch(() => {
      // If direct item add fails, the batch was still created
      this.loggerService.warn(
        `Could not add engagement item to batch ${batchId} via API, batch created as placeholder`,
        this.constructorName,
      );
    });

    return {
      creditsUsed: 1,
      data: {
        batchId,
        message: 'Engagement reply drafted and added to review queue.',
        platform,
        targetPostId,
      },
      success: true,
    };
  }

  private async getApprovalSummary(
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    if (!this.batchGenerationService) {
      return {
        creditsUsed: 0,
        error: 'Batch generation service not available',
        success: false,
      };
    }

    const result = await this.batchGenerationService.getBatches(
      ctx.organizationId,
      { limit: 50 },
    );

    let totalPending = 0;
    let contentPending = 0;
    let engagementPending = 0;
    let oldestPendingAge = 0;

    for (const batch of result.items) {
      totalPending += batch.pendingCount ?? 0;
      // Aggregate counts based on source
      if (
        (batch as unknown as Record<string, unknown>).source === 'proactive'
      ) {
        engagementPending += batch.pendingCount ?? 0;
      } else {
        contentPending += batch.pendingCount ?? 0;
      }

      if (batch.createdAt) {
        const age = Date.now() - new Date(batch.createdAt as string).getTime();
        if (age > oldestPendingAge && (batch.pendingCount ?? 0) > 0) {
          oldestPendingAge = age;
        }
      }
    }

    const oldestPendingHours = Math.round(oldestPendingAge / 3600000);

    return {
      creditsUsed: 0,
      data: {
        contentPending,
        engagementPending,
        oldestPendingHours,
        totalBatches: result.total,
        totalPending,
      },
      success: true,
    };
  }

  private async analyzePerformance(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const days = (params.days as number) || 30;
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Get published posts from the period
    const posts = await this.postsService.findAll(
      [
        {
          $match: {
            createdAt: { $gte: startDate, $lte: endDate },
            isDeleted: false,
            organization: new Types.ObjectId(ctx.organizationId),
            status: PostStatus.PUBLIC,
          },
        },
        { $sort: { createdAt: -1 } },
        { $limit: 100 },
        {
          $project: {
            _id: 1,
            createdAt: 1,
            description: { $substr: ['$description', 0, 100] },
            engagement: 1,
            impressions: 1,
            likes: 1,
            platform: 1,
          },
        },
      ],
      {},
    );

    const postDocs = (posts.docs ?? []) as unknown as Record<string, unknown>[];

    // Group by platform
    const byPlatform: Record<string, number> = {};
    for (const p of postDocs) {
      const plat = (p.platform as string) || 'unknown';
      byPlatform[plat] = (byPlatform[plat] || 0) + 1;
    }

    // Top performers by engagement
    const topPerformers = postDocs
      .filter((p) => p.engagement || p.likes || p.impressions)
      .sort(
        (a, b) =>
          ((b.engagement as number) || (b.likes as number) || 0) -
          ((a.engagement as number) || (a.likes as number) || 0),
      )
      .slice(0, 5)
      .map((p) => ({
        description: p.description,
        engagement: p.engagement ?? p.likes,
        id: String(p._id),
        platform: p.platform,
      }));

    return {
      creditsUsed: 0,
      data: {
        byPlatform,
        days,
        topPerformers,
        totalPosts: postDocs.length,
      },
      success: true,
    };
  }

  private async getContentCalendar(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const days = (params.days as number) || 7;
    const now = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + days);

    // Get scheduled and draft posts for the coming week
    const posts = await this.postsService.findAll(
      [
        {
          $match: {
            $or: [
              { scheduledDate: { $gte: now, $lte: endDate } },
              { status: PostStatus.DRAFT },
            ],
            isDeleted: false,
            organization: new Types.ObjectId(ctx.organizationId),
          },
        },
        { $sort: { createdAt: -1, scheduledDate: 1 } },
        { $limit: 50 },
        {
          $project: {
            _id: 1,
            description: { $substr: ['$description', 0, 100] },
            platform: 1,
            scheduledDate: 1,
            status: 1,
          },
        },
      ],
      {},
    );

    const postDocs = (posts.docs ?? []) as unknown as Record<string, unknown>[];
    const scheduled = postDocs.filter((p) => p.scheduledDate);
    const drafts = postDocs.filter(
      (p) => p.status === PostStatus.DRAFT && !p.scheduledDate,
    );

    // Find gap days (days with no scheduled content)
    const scheduledDates = new Set(
      scheduled.map(
        (p) => new Date(p.scheduledDate as string).toISOString().split('T')[0],
      ),
    );

    const gapDays: string[] = [];
    for (let d = 0; d < days; d++) {
      const date = new Date(now);
      date.setDate(date.getDate() + d);
      const dateStr = date.toISOString().split('T')[0];
      if (!scheduledDates.has(dateStr)) {
        gapDays.push(dateStr);
      }
    }

    return {
      creditsUsed: 0,
      data: {
        days,
        draftsCount: drafts.length,
        gapDays,
        gapsCount: gapDays.length,
        scheduled: scheduled.map((p) => ({
          description: p.description,
          id: String(p._id),
          platform: p.platform,
          scheduledDate: p.scheduledDate,
        })),
        scheduledCount: scheduled.length,
      },
      success: true,
    };
  }

  private async updateStrategyState(
    params: Record<string, unknown>,
    _ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    // This is a bookkeeping tool — the actual state update happens
    // in the CronProactiveAgentService after the agent run completes.
    // Here we just acknowledge the summary for the thread record.
    return {
      creditsUsed: 0,
      data: {
        contentGenerated: (params.contentGenerated as number) || 0,
        engagementsFound: (params.engagementsFound as number) || 0,
        recorded: true,
        repliesDrafted: (params.repliesDrafted as number) || 0,
        summary: params.summary as string,
      },
      success: true,
    };
  }

  // ──────────────────────────────────────────────
  // IDENTITY TOOLS
  // ──────────────────────────────────────────────

  private async generateAsIdentity(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const text = params.text as string;

    if (!text) {
      return {
        creditsUsed: 0,
        error: 'text is required',
        success: false,
      };
    }

    const response = await this.callInternalApi(
      'POST',
      '/v1/videos/avatar',
      {
        text,
        useIdentity: true,
      },
      ctx,
    );

    const id =
      (response.data as Record<string, unknown>)?.id ??
      (response as Record<string, unknown>).id;

    return {
      creditsUsed: 0,
      data: {
        id,
        message:
          'Avatar video generation started using your identity (avatar + cloned voice).',
        status: 'processing',
      },
      nextActions: id
        ? [
            {
              ctas: [{ href: `/library/videos`, label: 'View in Library' }],
              description: `Avatar video generating: "${text.substring(0, 80)}"`,
              id: `identity-gen-${id}`,
              title: 'Identity video generating',
              type: 'content_preview_card',
            },
          ]
        : [],
      success: true,
    };
  }

  // ──────────────────────────────────────────────
  // DASHBOARD TOOLS
  // ──────────────────────────────────────────────

  private renderDashboard(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): AgentToolResult {
    const { operation, blocks, blockIds } = params as {
      operation: string;
      blocks?: unknown[];
      blockIds?: string[];
    };

    const normalizedOperation = this.normalizeDashboardOperation(operation);
    const normalizedBlocks = Array.isArray(blocks)
      ? (blocks as AgentUIBlock[])
      : undefined;

    if (
      ctx.threadId &&
      normalizedBlocks &&
      normalizedBlocks.length > 0 &&
      normalizedOperation !== 'remove' &&
      normalizedOperation !== 'clear'
    ) {
      const loadingBlocks = this.buildLoadingDashboardBlocks(normalizedBlocks);

      void this.publishStagedDashboardHydration({
        blockIds,
        blocks: normalizedBlocks,
        ctx,
        initialBlocks: loadingBlocks,
        operation: normalizedOperation,
      });
    }

    return {
      creditsUsed: 0,
      data: {
        blockIds,
        blocks: normalizedBlocks,
        deferUiBlocksPublish: normalizedBlocks?.length ? true : undefined,
        operation: normalizedOperation,
        uiBlocks: normalizedBlocks,
      },
      success: true,
    };
  }

  private normalizeDashboardOperation(
    operation: string | undefined,
  ): AgentDashboardOperation {
    if (
      operation === 'add' ||
      operation === 'update' ||
      operation === 'remove' ||
      operation === 'clear'
    ) {
      return operation;
    }

    return 'replace';
  }

  private buildLoadingDashboardBlocks(blocks: AgentUIBlock[]): AgentUIBlock[] {
    return blocks.map((block, index) =>
      this.toLoadingDashboardBlock(block, index),
    );
  }

  private toLoadingDashboardBlock(
    block: AgentUIBlock,
    index: number,
  ): AgentUIBlock {
    const hydration = {
      ...((block as HydratableDashboardBlock).hydration ?? {}),
      staggerMs: index * 90,
      status: 'loading' as const,
    };

    switch (block.type) {
      case 'metric_card':
        return {
          ...block,
          hydration,
          trend: undefined,
          value: '0',
        };
      case 'kpi_grid':
        return {
          ...block,
          cards: block.cards.map((card, cardIndex) => ({
            ...card,
            hydration: {
              ...((card as HydratableDashboardBlock<typeof card>).hydration ??
                {}),
              staggerMs: index * 90 + cardIndex * 60,
              status: 'loading' as const,
            },
            trend: undefined,
            value: '0',
          })),
          hydration,
        } satisfies KPIGridBlock;
      case 'chart':
        return {
          ...block,
          data: [],
          hydration,
        } satisfies ChartBlock;
      case 'table':
        return {
          ...block,
          hydration,
          rows: [],
        } satisfies TableBlock;
      case 'top_posts':
        return {
          ...block,
          hydration,
          posts: [],
        } satisfies TopPostsBlock;
      case 'composite':
        return {
          ...block,
          blocks: this.buildLoadingDashboardBlocks(block.blocks),
          hydration,
        };
      default:
        return {
          ...block,
          hydration,
        };
    }
  }

  private markDashboardBlockReady(block: AgentUIBlock): AgentUIBlock {
    switch (block.type) {
      case 'kpi_grid':
        return {
          ...block,
          cards: block.cards.map((card) => ({
            ...card,
            hydration: {
              ...((card as HydratableDashboardBlock<typeof card>).hydration ??
                {}),
              status: 'ready',
            },
          })),
          hydration: {
            ...((block as HydratableDashboardBlock).hydration ?? {}),
            status: 'ready',
          },
        } satisfies KPIGridBlock;
      case 'composite':
        return {
          ...block,
          blocks: block.blocks.map((child) =>
            this.markDashboardBlockReady(child),
          ),
          hydration: {
            ...((block as HydratableDashboardBlock).hydration ?? {}),
            status: 'ready',
          },
        };
      default:
        return {
          ...block,
          hydration: {
            ...((block as HydratableDashboardBlock).hydration ?? {}),
            status: 'ready',
          },
        };
    }
  }

  private publishTokenEffect(
    data: Parameters<AgentStreamPublisherService['publishToken']>[0],
  ): Effect.Effect<void, unknown> {
    if (!this.streamPublisher) {
      return Effect.void;
    }

    return this.streamPublisher.publishTokenEffect(data);
  }

  private publishToolProgressEffect(
    data: Parameters<AgentStreamPublisherService['publishToolProgress']>[0],
  ): Effect.Effect<void, unknown> {
    if (!this.streamPublisher) {
      return Effect.void;
    }

    return this.streamPublisher.publishToolProgressEffect(data);
  }

  private publishWorkEventEffect(
    data: Parameters<AgentStreamPublisherService['publishWorkEvent']>[0],
  ): Effect.Effect<void, unknown> {
    if (!this.streamPublisher) {
      return Effect.void;
    }

    return this.streamPublisher.publishWorkEventEffect(data);
  }

  private publishUIBlocksEffect(
    data: Parameters<AgentStreamPublisherService['publishUIBlocks']>[0],
  ): Effect.Effect<void, unknown> {
    if (!this.streamPublisher) {
      return Effect.void;
    }

    return this.streamPublisher.publishUIBlocksEffect(data);
  }

  private async publishStagedDashboardHydration(params: {
    blockIds?: string[];
    blocks: AgentUIBlock[];
    ctx: ToolExecutionContext;
    initialBlocks: AgentUIBlock[];
    operation: AgentDashboardOperation;
  }): Promise<void> {
    const { blockIds, blocks, ctx, initialBlocks, operation } = params;

    if (!ctx.threadId) {
      return;
    }

    try {
      await runEffectPromise(
        this.publishUIBlocksEffect({
          blockIds,
          blocks: initialBlocks,
          operation,
          runId: ctx.runId,
          threadId: ctx.threadId,
          userId: ctx.userId,
        }),
      );
    } catch {
      return;
    }

    await Promise.all(
      blocks.map(
        (block, index) =>
          new Promise<void>((resolve) => {
            setTimeout(
              async () => {
                try {
                  await runEffectPromise(
                    this.publishUIBlocksEffect({
                      blockIds: [block.id],
                      blocks: [this.markDashboardBlockReady(block)],
                      operation: 'update',
                      runId: ctx.runId,
                      threadId: ctx.threadId ?? ctx.runId ?? block.id,
                      userId: ctx.userId,
                    }),
                  );
                } catch {
                  // Redis failure is non-fatal.
                } finally {
                  resolve();
                }
              },
              180 + index * 140,
            );
          }),
      ),
    );
  }

  // ──────────────────────────────────────────────
  // INGREDIENT PICKER TOOLS
  // ──────────────────────────────────────────────

  private async selectIngredient(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const PICKER_LIMIT = 9;
    const mediaType = (params.mediaType as string | undefined) ?? 'all';

    const categoryFilter: string[] = [];
    if (mediaType === 'image' || mediaType === 'all') {
      categoryFilter.push(IngredientCategory.IMAGE);
    }
    if (mediaType === 'video' || mediaType === 'all') {
      categoryFilter.push(IngredientCategory.VIDEO);
    }

    const baseFilters: Record<string, unknown> = {
      category: { $in: categoryFilter },
      status: IngredientStatus.GENERATED,
    };

    if (params.brandId) {
      baseFilters.brand = new Types.ObjectId(params.brandId as string);
    }

    type AssetDoc = {
      _id: unknown;
      category: string;
      cdnUrl?: string;
      metadata?: { label?: string } | null;
    };

    let assets: AssetDoc[] = [];

    if (this.imagesService) {
      const docs = await this.imagesService.findAllByOrganization(
        ctx.organizationId,
        baseFilters,
        { createdAt: -1 },
        [{ path: 'metadata', select: '_id label' }],
      );

      assets = (docs as AssetDoc[]).slice(0, PICKER_LIMIT);
    }

    if (assets.length === 0) {
      return {
        creditsUsed: 0,
        data: {
          count: 0,
          message: 'No media assets found in your library.',
        },
        success: true,
      };
    }

    const ingredients: AgentIngredientItem[] = assets.map((asset) => {
      const id = String(asset._id);
      const url = asset.cdnUrl ?? '';
      const isVideo = asset.category === IngredientCategory.VIDEO;
      const title =
        (asset.metadata as { label?: string } | null)?.label ?? undefined;

      return {
        id,
        thumbnailUrl: url,
        title,
        type: isVideo ? ('video' as const) : ('image' as const),
        url,
      };
    });

    return {
      creditsUsed: 0,
      data: {
        count: ingredients.length,
        message: `Found ${ingredients.length} asset${ingredients.length === 1 ? '' : 's'} in your library.`,
      },
      nextActions: [
        {
          description:
            'Select an asset from your library to use as an ingredient',
          id: `ingredient-picker-${Date.now()}`,
          ingredients,
          title: 'Pick from your library',
          type: 'ingredient_picker_card' as const,
        },
      ],
      success: true,
    };
  }

  private prepareGeneration(params: Record<string, unknown>): AgentToolResult {
    const generationType = params.generationType as 'image' | 'video';
    const prompt = params.prompt as string | undefined;
    const model = params.model as string | undefined;
    const aspectRatio = params.aspectRatio as string | undefined;
    const duration = params.duration as number | undefined;

    if (!generationType || !prompt) {
      return {
        creditsUsed: 0,
        error: 'generationType and prompt are required',
        success: false,
      };
    }

    const title =
      generationType === 'video' ? 'Generate Video' : 'Generate Image';

    return {
      creditsUsed: 0,
      data: { generationType, prompt },
      nextActions: [
        {
          description: `Review and adjust parameters before generating`,
          generationParams: {
            aspectRatio: aspectRatio || '1:1',
            duration: generationType === 'video' ? duration || 5 : undefined,
            model,
            prompt,
          },
          generationType,
          id: `gen-card-${Date.now()}`,
          title,
          type: 'generation_action_card' as const,
        },
      ],
      success: true,
    };
  }

  private async prepareWorkflowTrigger(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const limit = Math.min((params.limit as number) || 5, 5);

    const workflows = await this.workflowsService.findAll(
      [
        {
          $match: {
            isDeleted: false,
            organization: new Types.ObjectId(ctx.organizationId),
          },
        },
        { $sort: { updatedAt: -1 } },
        { $limit: limit },
        { $project: { _id: 1, description: 1, name: 1, status: 1 } },
      ],
      {},
    );

    const workflowList =
      workflows.docs?.map((w) => {
        const workflow = w as unknown as Record<string, unknown>;
        return {
          description:
            typeof workflow.description === 'string'
              ? workflow.description
              : undefined,
          id: String(workflow._id),
          name:
            typeof workflow.name === 'string' && workflow.name.length > 0
              ? workflow.name
              : 'Workflow',
          status:
            typeof workflow.status === 'string' ? workflow.status : undefined,
        };
      }) ?? [];

    return {
      creditsUsed: 0,
      nextActions: [
        {
          id: `workflow-trigger-${Date.now()}`,
          title: 'Run a Workflow',
          type: 'workflow_trigger_card' as const,
          workflows: workflowList,
        },
      ],
      success: true,
    };
  }

  private async prepareVoiceClone(
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const currentBrand = await this.brandsService.findOne(
      {
        isDeleted: false,
        isSelected: true,
        organization: new Types.ObjectId(ctx.organizationId),
        user: new Types.ObjectId(ctx.userId),
      },
      'none',
    );

    const orgSettings = this.organizationSettingsService
      ? await this.organizationSettingsService.findOne({
          isDeleted: false,
          organization: new Types.ObjectId(ctx.organizationId),
        })
      : null;

    const clonedVoices = this.voicesService
      ? await this.voicesService.findAll(
          [
            {
              $match: {
                isCloned: true,
                isDeleted: false,
                organization: new Types.ObjectId(ctx.organizationId),
                type: 'voice',
              },
            },
            { $sort: { createdAt: -1 } },
            {
              $project: {
                _id: 1,
                cloneStatus: 1,
                metadataLabel: 1,
                provider: 1,
              },
            },
            { $limit: 20 },
          ],
          {},
        )
      : { docs: [] };

    const existingVoices =
      clonedVoices.docs?.map((voice: unknown) => {
        const v = voice as Record<string, unknown>;
        return {
          cloneStatus: (v.cloneStatus as string | undefined) ?? undefined,
          id: String(v._id),
          label:
            (v.metadataLabel as string | undefined) ??
            (v.label as string | undefined) ??
            'Voice',
          provider: (v.provider as string | undefined) ?? undefined,
        };
      }) ?? [];

    const readyVoices = existingVoices.filter(
      (voice) =>
        voice.cloneStatus?.toLowerCase() === VoiceCloneStatus.READY ||
        voice.cloneStatus?.toLowerCase() === 'ready',
    );

    const effectiveBrandAgentConfig = resolveEffectiveBrandAgentConfig({
      brand: currentBrand as Parameters<
        typeof resolveEffectiveBrandAgentConfig
      >[0]['brand'],
      organizationSettings: orgSettings as Parameters<
        typeof resolveEffectiveBrandAgentConfig
      >[0]['organizationSettings'],
    });
    const currentBrandDefaultVoiceId =
      effectiveBrandAgentConfig.identityDefaults.brand.defaultVoiceId?.toString();
    const orgDefaultVoiceId =
      effectiveBrandAgentConfig.identityDefaults.organization.defaultVoiceId?.toString();

    const recommendedVoiceId =
      currentBrandDefaultVoiceId || orgDefaultVoiceId || readyVoices[0]?.id;

    return {
      creditsUsed: 0,
      nextActions: [
        {
          brandId: currentBrand
            ? String((currentBrand as { _id: unknown })._id)
            : undefined,
          canUpload: true,
          canUseExisting: existingVoices.length > 0,
          description:
            existingVoices.length > 0
              ? 'Use an existing cloned voice or upload a new audio sample.'
              : 'No cloned voices found. Upload an audio sample to start cloning.',
          existingVoices,
          id: `voice-clone-${Date.now()}`,
          recommendedVoiceId,
          title: 'Set Up Voice Clone',
          type: 'voice_clone_card' as const,
        },
      ],
      success: true,
    };
  }

  private async prepareClipWorkflowRun(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const currentBrand = await this.brandsService.findOne(
      {
        isDeleted: false,
        isSelected: true,
        organization: new Types.ObjectId(ctx.organizationId),
        user: new Types.ObjectId(ctx.userId),
      },
      'none',
    );
    const selectedBrandId = currentBrand
      ? String((currentBrand as Record<string, unknown>)._id)
      : null;
    const requestedWorkflowId = (
      params.workflowId as string | undefined
    )?.trim();
    const prompt =
      ((params.prompt as string | undefined)?.trim() ??
        (params.topic as string | undefined)?.trim()) ||
      'Create a 30-second landscape clip for Twitter/X';
    const durationSeconds = Math.max(
      5,
      Math.min(60, Number(params.durationSeconds ?? params.duration ?? 30)),
    );
    const model = (params.model as string | undefined)?.trim() || undefined;
    const autonomousMode = Boolean(params.autonomousMode ?? true);
    const requireStepConfirmation = Boolean(
      params.requireStepConfirmation ?? true,
    );
    const mergeGeneratedVideos = Boolean(params.mergeGeneratedVideos ?? true);

    const workflows = await this.workflowsService.findAll(
      [
        {
          $match: {
            isDeleted: false,
            organization: new Types.ObjectId(ctx.organizationId),
          },
        },
        { $sort: { updatedAt: -1 } },
        { $limit: 5 },
        { $project: { _id: 1, description: 1, name: 1, status: 1 } },
      ],
      {},
    );

    const workflowList =
      workflows.docs?.map((w: unknown) => {
        const doc = w as Record<string, unknown>;
        return {
          description:
            typeof doc.description === 'string' ? doc.description : undefined,
          id: String(doc._id),
          name:
            typeof doc.name === 'string' && doc.name.length > 0
              ? doc.name
              : 'Workflow',
          status: typeof doc.status === 'string' ? doc.status : undefined,
        };
      }) ?? [];

    let selectedWorkflow = requestedWorkflowId;
    if (!selectedWorkflow && workflowList.length > 0) {
      selectedWorkflow = workflowList[0].id;
    }

    if (
      selectedWorkflow &&
      !workflowList.some((wf) => wf.id === selectedWorkflow)
    ) {
      const workflow = await this.workflowsService.findOne({
        _id: selectedWorkflow,
        isDeleted: false,
        organization: ctx.organizationId,
      });

      if (!workflow) {
        return {
          creditsUsed: 0,
          error: `Workflow ${selectedWorkflow} not found`,
          success: false,
        };
      }

      const wf = workflow as unknown as Record<string, unknown>;
      workflowList.unshift({
        description:
          typeof wf.description === 'string' ? wf.description : undefined,
        id: String(wf._id ?? selectedWorkflow),
        name:
          typeof wf.name === 'string' && wf.name.length > 0
            ? wf.name
            : 'Workflow',
        status: typeof wf.status === 'string' ? wf.status : undefined,
      });
    }

    return {
      creditsUsed: 0,
      data: {
        durationSeconds,
        format: 'landscape',
        intent: 'twitter_clip',
        mergeGeneratedVideos,
        prompt,
      },
      nextActions: [
        {
          brandId: selectedBrandId ?? undefined,
          clipRun: {
            autonomousMode,
            durationSeconds,
            format: 'landscape',
            inputValues: {
              confirmBeforePublish: true,
              duration: durationSeconds,
              format: 'landscape',
              intent: 'twitter_clip',
              mergeGeneratedVideos,
              prompt,
            },
            mergeGeneratedVideos,
            model,
            prompt,
            requireStepConfirmation,
          },
          clipRunState: {
            brandId: selectedBrandId ?? '',
            clipProjectId: selectedWorkflow ?? `clip-${Date.now()}`,
            currentStep: 'generate',
            modes: {
              aspectRatio: '16:9' as const,
              confirmBeforePublish: true,
              duration: (durationSeconds <= 15
                ? 15
                : durationSeconds <= 30
                  ? 30
                  : 60) as 15 | 30 | 60,
              enableMerge: mergeGeneratedVideos,
              enableReframe: false,
              platform: 'twitter' as const,
            },
            organizationId: ctx.organizationId,
            status: 'idle' as const,
            steps: [
              {
                id: 'generate',
                label: 'Generate Clip',
                retryable: true,
                status: 'pending' as const,
              },
              {
                id: 'merge',
                label: 'Merge Clips',
                retryable: true,
                status: mergeGeneratedVideos
                  ? ('pending' as const)
                  : ('skipped' as const),
              },
              {
                id: 'reframe',
                label: 'Reframe Portrait',
                retryable: true,
                status: 'pending' as const,
              },
              {
                id: 'publish-handoff',
                label: 'Publish Handoff',
                retryable: false,
                status: 'pending' as const,
              },
            ],
          },
          description:
            'Generate a 30-second landscape clip, optionally merge multiple clips, then reframe to portrait for Instagram.',
          id: `clip-workflow-run-${Date.now()}`,
          title: 'Run Clip Workflow (X → IG)',
          type: 'clip_workflow_run_card' as const,
          workflowDescription: workflowList.find(
            (wf) => wf.id === selectedWorkflow,
          )?.description,
          workflowId: selectedWorkflow,
          workflowName: workflowList.find((wf) => wf.id === selectedWorkflow)
            ?.name,
          workflows: workflowList,
        },
      ],
      success: true,
    };
  }

  private suggestIngredientAlternatives(
    params: Record<string, unknown>,
  ): AgentToolResult {
    const generationType = params.generationType as 'image' | 'video';
    const alternatives = params.alternatives as
      | { label: string; prompt: string }[]
      | undefined;

    if (!generationType || !alternatives?.length) {
      return {
        creditsUsed: 0,
        error: 'generationType and alternatives are required',
        success: false,
      };
    }

    return {
      creditsUsed: 0,
      nextActions: [
        {
          alternatives: alternatives.map((a) => ({ ...a, generationType })),
          id: `ingredient-alts-${Date.now()}`,
          title: 'Alternative Prompts',
          type: 'ingredient_alternatives_card' as const,
        },
      ],
      success: true,
    };
  }

  // ──────────────────────────────────────────────
  // HELPERS
  // ──────────────────────────────────────────────

  private async callInternalApi(
    method: 'GET' | 'POST',
    path: string,
    body: Record<string, unknown> | undefined,
    ctx: ToolExecutionContext,
  ): Promise<Record<string, unknown>> {
    const url = `${this.apiBaseUrl}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (ctx.authToken) {
      headers.Authorization = `Bearer ${ctx.authToken}`;
    }

    const response = await firstValueFrom(
      method === 'POST'
        ? this.httpService.post(url, body, { headers })
        : this.httpService.get(url, { headers }),
    );

    return response.data as Record<string, unknown>;
  }

  private aspectRatioToDimensions(ratio: string): {
    width: number;
    height: number;
  } {
    const map: Record<string, { width: number; height: number }> = {
      '1:1': { height: 1024, width: 1024 },
      '3:4': { height: 1365, width: 1024 },
      '4:3': { height: 768, width: 1024 },
      '9:16': { height: 1024, width: 576 },
      '16:9': { height: 576, width: 1024 },
    };
    return map[ratio] || map['1:1'];
  }

  private normalizeHandle(handle: string, name: string): string {
    const raw = handle || name;
    const normalized = raw
      .toLowerCase()
      .replace(/^@/, '')
      .replace(/[^a-z0-9_]/g, '');

    if (normalized.length > 0) {
      return normalized;
    }

    return `brand_${Date.now()}`;
  }

  // ──────────────────────────────────────────────
  // SUB-AGENT SPAWNING
  // ──────────────────────────────────────────────

  private async spawnContentAgent(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    if (!this.agentSpawnService) {
      return {
        creditsUsed: 0,
        error: 'AgentSpawnService is not available',
        success: false,
      };
    }

    const agentType = params.agentType as AgentType;
    const task = params.task as string;
    const credentialId = params.credentialId as string | undefined;

    if (!agentType || !task) {
      return {
        creditsUsed: 0,
        error: 'agentType and task are required',
        success: false,
      };
    }

    return this.agentSpawnService.spawnSubAgent({
      agentType,
      credentialId,
      parentContext: {
        authToken: ctx.authToken,
        generationPriority: ctx.generationPriority,
        organizationId: ctx.organizationId,
        userId: ctx.userId,
      },
      task,
    });
  }

  // ──────────────────────────────────────────────
  // CAMPAIGN COORDINATION TOOLS
  // ──────────────────────────────────────────────

  private async requestAsset(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const targetAgentId = params.targetAgentId as string | undefined;
    const assetType = params.assetType as string | undefined;
    const prompt = params.prompt as string | undefined;
    const specifications = params.specifications as
      | Record<string, unknown>
      | undefined;

    if (!targetAgentId || !assetType || !prompt) {
      return {
        creditsUsed: 0,
        error: 'targetAgentId, assetType, and prompt are required',
        success: false,
      };
    }

    if (!this.agentSpawnService) {
      return {
        creditsUsed: 0,
        error: 'Agent spawn service not available',
        success: false,
      };
    }

    // Build a comprehensive task from the asset request
    const specsStr = specifications
      ? ` Specifications: ${JSON.stringify(specifications)}`
      : '';
    const task = `Create a ${assetType} asset: ${prompt}.${specsStr}`;

    // Map asset types to agent types for spawning
    const assetTypeToAgentType: Record<string, AgentType> = {
      audio: AgentType.GENERAL,
      image: AgentType.IMAGE_CREATOR,
      text: AgentType.ARTICLE_WRITER,
      video: AgentType.VIDEO_CREATOR,
    };

    const agentType = assetTypeToAgentType[assetType] || AgentType.GENERAL;

    try {
      const result = await this.agentSpawnService.spawnSubAgent({
        agentType,
        parentContext: {
          authToken: ctx.authToken,
          generationPriority: ctx.generationPriority,
          organizationId: ctx.organizationId,
          runId: ctx.runId,
          strategyId: targetAgentId,
          userId: ctx.userId,
        },
        task,
      });

      return {
        creditsUsed: result.creditsUsed,
        data: {
          assetType,
          deliveredBy: targetAgentId,
          result: result.data,
        },
        success: result.success,
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      this.loggerService.error(`${this.constructorName} REQUEST_ASSET failed`, {
        error: errorMessage,
        targetAgentId,
      });

      return {
        creditsUsed: 0,
        error: `Asset request failed: ${errorMessage}`,
        success: false,
      };
    }
  }

  // ──────────────────────────────────────────────
  // CONTENT QUALITY SCORING
  // ──────────────────────────────────────────────

  private async rateContent(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    if (!this.contentQualityScorerService) {
      return {
        creditsUsed: 0,
        error: 'ContentQualityScorerService not available',
        success: false,
      };
    }

    const contentId = params.contentId ? String(params.contentId) : undefined;
    const contentType = params.contentType
      ? String(params.contentType)
      : 'image';
    const context = params.context ? String(params.context) : undefined;

    if (!contentId) {
      return {
        creditsUsed: 0,
        error: 'contentId is required',
        success: false,
      };
    }

    try {
      const result = await this.contentQualityScorerService.scoreContent(
        contentId,
        contentType,
        context,
        ctx.organizationId,
      );

      return {
        creditsUsed: 0,
        data: {
          ...(result as unknown as Record<string, unknown>),
          message: `Quality score: ${result.score}/10 (${result.category}). ${result.suggestions[0] ?? ''}`,
        },
        success: true,
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      this.loggerService.error(`${this.constructorName} RATE_CONTENT failed`, {
        contentId,
        error: errorMessage,
      });

      return {
        creditsUsed: 0,
        error: `Rate content failed: ${errorMessage}`,
        success: false,
      };
    }
  }

  // ──────────────────────────────────────────────
  // INGREDIENT VOTING & REPLICATION TOOLS
  // ──────────────────────────────────────────────

  private async rateIngredient(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    try {
      const ingredientId = String(params.ingredientId || '');

      if (!ingredientId || !Types.ObjectId.isValid(ingredientId)) {
        return {
          creditsUsed: 0,
          error: 'Valid ingredientId is required',
          success: false,
        };
      }

      if (!this.votesService) {
        return {
          creditsUsed: 0,
          error: 'VotesService not available',
          success: false,
        };
      }

      // Toggle: if an active vote exists, remove it; otherwise create one
      const existing = await this.votesService.findOne({
        entity: new Types.ObjectId(ingredientId),
        isDeleted: false,
        user: new Types.ObjectId(ctx.userId),
      });

      if (existing) {
        await this.votesService.patchAll(
          {
            _id: existing._id,
          },
          { $set: { isDeleted: true } },
        );

        return {
          creditsUsed: 0,
          data: {
            action: 'removed',
            ingredientId,
          },
          success: true,
        };
      }

      const vote = await this.votesService.create(
        new VoteEntity({
          entity: new Types.ObjectId(ingredientId),
          entityModel: VoteEntityModel.INGREDIENT,
          user: new Types.ObjectId(ctx.userId),
        }),
      );

      return {
        creditsUsed: 0,
        data: {
          action: 'added',
          ingredientId,
          voteId: String(vote._id),
        },
        success: true,
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.loggerService.error(
        `${this.constructorName} RATE_INGREDIENT failed`,
        { error: errorMessage },
      );
      return {
        creditsUsed: 0,
        error: `Rate ingredient failed: ${errorMessage}`,
        success: false,
      };
    }
  }

  private async getTopIngredients(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    try {
      const brandId = params.brandId ? String(params.brandId) : undefined;
      const limit = Number(params.limit) || 10;
      const category = params.category ? String(params.category) : undefined;

      if (!this.ingredientsService) {
        return {
          creditsUsed: 0,
          error: 'IngredientsService not available',
          success: false,
        };
      }

      const result = await this.ingredientsService.findTopByVotes({
        brandId,
        category,
        limit,
        organizationId: ctx.organizationId,
      });

      const ingredients = result.docs.map((doc) => ({
        _id: String(doc._id),
        category: (doc as unknown as Record<string, unknown>).category,
        status: (doc as unknown as Record<string, unknown>).status,
        totalVotes: (doc as unknown as Record<string, unknown>).totalVotes ?? 0,
      }));

      return {
        creditsUsed: 0,
        data: {
          ingredients,
          total: result.totalDocs,
        },
        success: true,
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.loggerService.error(
        `${this.constructorName} GET_TOP_INGREDIENTS failed`,
        { error: errorMessage },
      );
      return {
        creditsUsed: 0,
        error: `Get top ingredients failed: ${errorMessage}`,
        success: false,
      };
    }
  }

  private async replicateTopIngredient(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    try {
      const ingredientId = String(params.ingredientId || '');
      const variations = Number(params.variations) || 3;

      if (!ingredientId || !Types.ObjectId.isValid(ingredientId)) {
        return {
          creditsUsed: 0,
          error: 'Valid ingredientId is required',
          success: false,
        };
      }

      if (!this.ingredientsService) {
        return {
          creditsUsed: 0,
          error: 'IngredientsService not available',
          success: false,
        };
      }

      const ingredient = await this.ingredientsService.findOne({
        _id: new Types.ObjectId(ingredientId),
        isDeleted: false,
        organization: new Types.ObjectId(ctx.organizationId),
      });

      if (!ingredient) {
        return {
          creditsUsed: 0,
          error: `Ingredient ${ingredientId} not found`,
          success: false,
        };
      }

      const ingredientData = ingredient as unknown as Record<string, unknown>;
      const category = String(ingredientData.category || '');

      // Return action card with ingredient metadata for the agent to use
      // with existing generation tools (generate_image / generate_video)
      return {
        creditsUsed: 0,
        data: {
          category,
          ingredientId,
          message: `Ready to replicate ingredient. Use generate_image or generate_video with the same parameters to create ${variations} variation(s).`,
          sourceMetadata: {
            brand: ingredientData.brand
              ? String(ingredientData.brand)
              : undefined,
            category,
            prompt: ingredientData.prompt
              ? String(ingredientData.prompt)
              : undefined,
            status: ingredientData.status,
          },
          suggestedVariations: variations,
        },
        nextActions: [
          {
            label: `Generate ${variations} variation(s)`,
            type: 'generate',
          } as unknown as AgentUiAction,
        ],
        success: true,
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.loggerService.error(
        `${this.constructorName} REPLICATE_TOP_INGREDIENT failed`,
        { error: errorMessage },
      );
      return {
        creditsUsed: 0,
        error: `Replicate ingredient failed: ${errorMessage}`,
        success: false,
      };
    }
  }
}
