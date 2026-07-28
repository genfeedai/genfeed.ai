import { resolveEffectiveBrandAgentConfig } from '@api/collections/brands/utils/brand-agent-config-resolution.util';
import { resolveClipIdentity } from '@api/collections/clip-projects/services/clip-identity-resolution.util';
import { ImagesService } from '@api/collections/images/services/images.service';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { VoicesService } from '@api/collections/voices/services/voices.service';
import { WorkflowsService } from '@api/collections/workflows/services/workflows.service';
import {
  type ApiKeyPublishingContext,
  assertApiKeyAgentPublishingScope as assertScope,
} from '@api/helpers/utils/auth/api-key-publishing-scope.util';
import { runEffectPromise } from '@api/helpers/utils/effect/effect.util';
import { AgentStreamPublisherService } from '@api/services/agent-orchestrator/agent-stream-publisher.service';
import { AgentAdsResearchToolHandler } from '@api/services/agent-orchestrator/tools/agent-ads-research-tool-handler.service';
import { AgentAnalyticsToolHandler } from '@api/services/agent-orchestrator/tools/agent-analytics-tool-handler.service';
import { AgentBrandInterviewToolHandler } from '@api/services/agent-orchestrator/tools/agent-brand-interview-tool-handler.service';
import { AgentCampaignToolHandler } from '@api/services/agent-orchestrator/tools/agent-campaign-tool-handler.service';
import { AgentConnectionToolHandler } from '@api/services/agent-orchestrator/tools/agent-connection-tool-handler.service';
import { AgentDashboardToolHandler } from '@api/services/agent-orchestrator/tools/agent-dashboard-tool-handler.service';
import { AgentInstagramInspirationToolHandler } from '@api/services/agent-orchestrator/tools/agent-instagram-inspiration-tool-handler.service';
import { AgentLivestreamToolHandler } from '@api/services/agent-orchestrator/tools/agent-livestream-tool-handler.service';
import { AgentMediaGenerationToolHandler } from '@api/services/agent-orchestrator/tools/agent-media-generation-tool-handler.service';
import { AgentMemoryGoalsToolHandler } from '@api/services/agent-orchestrator/tools/agent-memory-goals-tool-handler.service';
import { AgentOnboardingToolHandler } from '@api/services/agent-orchestrator/tools/agent-onboarding-tool-handler.service';
import { AgentProactiveToolHandler } from '@api/services/agent-orchestrator/tools/agent-proactive-tool-handler.service';
import { AgentPublishToolHandler } from '@api/services/agent-orchestrator/tools/agent-publish-tool-handler.service';
import { AgentQualityToolHandler } from '@api/services/agent-orchestrator/tools/agent-quality-tool-handler.service';
import { AgentReviewToolHandler } from '@api/services/agent-orchestrator/tools/agent-review-tool-handler.service';
import { AgentRouteRewriteService } from '@api/services/agent-orchestrator/tools/agent-route-rewrite.service';
import {
  readOptionalNumber,
  readOptionalString,
} from '@api/services/agent-orchestrator/tools/agent-tool-parameter-readers';
import { AgentTrendsToolHandler } from '@api/services/agent-orchestrator/tools/agent-trends-tool-handler.service';
import { AgentWorkflowToolHandler } from '@api/services/agent-orchestrator/tools/agent-workflow-tool-handler.service';
import { AgentWorkspaceToolHandler } from '@api/services/agent-orchestrator/tools/agent-workspace-tool-handler.service';
import { AgentSpawnService } from '@api/services/agent-spawn/agent-spawn.service';
import { BatchGenerationService } from '@api/services/batch-generation/batch-generation.service';
import {
  ActionOrigin,
  AgentType,
  IngredientCategory,
  IngredientStatus,
  VoiceCloneStatus,
  VoiceProvider,
} from '@genfeedai/enums';
import type {
  AgentClipRunIdentity,
  AgentDashboardOperation,
  AgentIngredientItem,
  AgentToolResult,
  AgentUIBlock,
  ChartBlock,
  IBrandAgentPrompting,
  IBrandConversationStarter,
  IGeneratedBrandProfile,
  KPIGridBlock,
  TableBlock,
  TopPostsBlock,
  ValidatedAgentScope,
} from '@genfeedai/interfaces';
import { AgentToolName } from '@genfeedai/interfaces';
import {
  AgentScopeContextService,
  resolveNestedActionOrigin,
  runWithActionOrigin,
  scopedWhere,
} from '@genfeedai/server';
import {
  type CanonicalToolDefinition,
  getToolsForRole,
  type ToolCategory,
  type ToolRequiredRole,
} from '@genfeedai/tools';
import { LoggerService } from '@libs/logger/logger.service';
import { Inject, Injectable, Optional } from '@nestjs/common';
import { Effect } from 'effect';

export interface ToolExecutionContext {
  apiKeyContext?: ApiKeyPublishingContext;
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
  /** Server-validated immutable organization + mutable brand/version scope. */
  validatedScope?: ValidatedAgentScope;
}
interface DashboardHydrationState {
  status?: 'idle' | 'loading' | 'ready';
  staggerMs?: number;
}
type HydratableDashboardBlock<T extends AgentUIBlock = AgentUIBlock> = T & {
  hydration?: DashboardHydrationState;
};
type ToolCatalogSurface = 'agent' | 'mcp' | 'cli' | 'all';

const BRANDLESS_AGENT_TOOLS = new Set<AgentToolName>([
  AgentToolName.ANALYZE_PERFORMANCE,
  AgentToolName.CHECK_GOAL_PROGRESS,
  AgentToolName.CHECK_ONBOARDING_STATUS,
  AgentToolName.CREATE_BRAND,
  AgentToolName.GET_AD_RESEARCH_DETAIL,
  AgentToolName.GET_ANALYTICS,
  AgentToolName.GET_APPROVAL_SUMMARY,
  AgentToolName.GET_CONNECTION_STATUS,
  AgentToolName.GET_CONTENT_CALENDAR,
  AgentToolName.GET_CREDITS_BALANCE,
  AgentToolName.GET_DASHBOARD_LAYOUT,
  AgentToolName.GET_TOP_INGREDIENTS,
  AgentToolName.GET_TRENDS,
  AgentToolName.GET_WORKFLOW_INPUTS,
  AgentToolName.GET_WORKFLOW_RUN,
  AgentToolName.INSPECT_WORKFLOW,
  AgentToolName.LIST_ADS_RESEARCH,
  AgentToolName.LIST_AGENT_RUNS,
  AgentToolName.LIST_BRANDS,
  AgentToolName.LIST_GENFEED_TOOLS,
  AgentToolName.LIST_POSTS,
  AgentToolName.LIST_REVIEW_QUEUE,
  AgentToolName.LIST_WORKFLOW_RUNS,
  AgentToolName.LIST_WORKFLOWS,
  AgentToolName.PRESENT_PAYMENT_OPTIONS,
  AgentToolName.RENDER_DASHBOARD,
  AgentToolName.RESOLVE_HANDLE,
]);
const TOOL_CATALOG_SURFACES = ['agent', 'mcp', 'cli'] as const;
const TOOL_CATALOG_CATEGORIES: ToolCategory[] = [
  'ads',
  'admin',
  'agent-control',
  'analytics',
  'campaign',
  'content',
  'generation',
  'identity',
  'onboarding',
  'other',
  'proactive',
  'social',
  'ui',
  'workflow',
];
const TOOL_CATALOG_ROLES: ToolRequiredRole[] = ['user', 'admin', 'superadmin'];

interface AgentBrandsServiceLike {
  create: (
    createDto: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>;
  findAll: (
    aggregate: Record<string, unknown> | Record<string, unknown>[],
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
  ) => Promise<IGeneratedBrandProfile>;
  updateAgentConfig?: (
    brandId: string,
    orgId: string,
    agentConfig: Record<string, unknown>,
  ) => Promise<Record<string, unknown> | null>;
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
  prompting?: IBrandAgentPrompting;
  sampleOutput: string;
  strategy?: {
    goals: string[];
    topics: string[];
  };
  style: string;
  taglines: string[];
  tone: string;
  values: string[];
  writingRules: string[];
}
@Injectable()
export class AgentToolExecutorService {
  private readonly constructorName = String(this.constructor.name);

  constructor(
    private readonly loggerService: LoggerService,
    @Inject('AGENT_BRANDS_SERVICE')
    private readonly brandsService: AgentBrandsServiceLike,
    private readonly routeRewriteService: AgentRouteRewriteService,
    private readonly memoryGoalsHandler: AgentMemoryGoalsToolHandler,
    private readonly dashboardHandler: AgentDashboardToolHandler,
    private readonly publishHandler: AgentPublishToolHandler,
    private readonly campaignHandler: AgentCampaignToolHandler,
    private readonly livestreamHandler: AgentLivestreamToolHandler,
    private readonly workflowsService: WorkflowsService,
    @Optional()
    private readonly batchGenerationService: BatchGenerationService,
    @Optional()
    private readonly organizationSettingsService: OrganizationSettingsService,
    @Optional()
    private readonly streamPublisher: AgentStreamPublisherService,
    @Optional()
    private readonly agentSpawnService: AgentSpawnService,
    @Optional()
    private readonly imagesService: ImagesService,
    @Optional()
    private readonly voicesService: VoicesService,
    private readonly instagramInspirationHandler: AgentInstagramInspirationToolHandler,
    private readonly brandInterviewHandler: AgentBrandInterviewToolHandler,
    private readonly workspaceHandler: AgentWorkspaceToolHandler,
    private readonly connectionHandler: AgentConnectionToolHandler,
    private readonly trendsHandler: AgentTrendsToolHandler,
    private readonly proactiveHandler: AgentProactiveToolHandler,
    private readonly qualityHandler: AgentQualityToolHandler,
    private readonly reviewHandler: AgentReviewToolHandler,
    private readonly adsResearchHandler: AgentAdsResearchToolHandler,
    private readonly onboardingHandler: AgentOnboardingToolHandler,
    private readonly analyticsHandler: AgentAnalyticsToolHandler,
    private readonly workflowHandler: AgentWorkflowToolHandler,
    private readonly mediaGenerationHandler: AgentMediaGenerationToolHandler,
    @Optional()
    private readonly agentScopeContextService?: AgentScopeContextService,
  ) {}

  async executeTool(
    toolName: AgentToolName,
    parameters: Record<string, unknown>,
    context: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    assertScope(context.apiKeyContext ?? {}, toolName, parameters);
    return runWithActionOrigin(
      resolveNestedActionOrigin(ActionOrigin.AGENT),
      () => this.executeToolWithActionOrigin(toolName, parameters, context),
    );
  }

  private async executeToolWithActionOrigin(
    toolName: AgentToolName,
    parameters: Record<string, unknown>,
    context: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const startTime = Date.now();
    try {
      if (context.threadId) {
        if (!context.validatedScope || !this.agentScopeContextService) {
          throw new Error(
            'Validated agent scope is required for thread tool execution.',
          );
        }

        await this.agentScopeContextService.assertConsequentialBoundary(
          context.validatedScope,
          'tool',
        );
        this.assertToolBrandScope(toolName, parameters, context);
      }

      const result = this.instagramInspirationHandler.handles(toolName)
        ? await this.instagramInspirationHandler.execute(
            toolName,
            parameters,
            context,
          )
        : await this.dispatch(toolName, parameters, context);
      const scopedResult = await this.routeRewriteService.scopeToolResultHrefs(
        result,
        context,
      );
      const durationMs = Date.now() - startTime;

      this.loggerService.log(
        `Tool ${toolName} executed in ${durationMs}ms`,
        this.constructorName,
      );

      return scopedResult;
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

  private assertToolBrandScope(
    toolName: AgentToolName,
    parameters: Record<string, unknown>,
    context: ToolExecutionContext,
  ): void {
    const scope = context.validatedScope;
    if (!scope) {
      throw new Error('Validated agent scope is required for tool execution.');
    }

    const parameterBrandId = readOptionalString(parameters.brandId);
    if (parameterBrandId && parameterBrandId !== scope.brandId) {
      throw new Error(
        'Tool brand parameters must match the validated thread brand scope.',
      );
    }

    if (context.brandId && context.brandId !== scope.brandId) {
      throw new Error(
        'Tool execution context disagrees with the validated thread brand scope.',
      );
    }

    if (!scope.brandId && !BRANDLESS_AGENT_TOOLS.has(toolName)) {
      throw new Error(
        `An explicit thread brand context is required for ${toolName}.`,
      );
    }
  }

  private async dispatch(
    toolName: AgentToolName,
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    switch (toolName) {
      case AgentToolName.LIST_GENFEED_TOOLS:
        return this.listGenfeedTools(params);

      case AgentToolName.GET_CREDITS_BALANCE:
        return this.workspaceHandler.getCreditsBalance(ctx);

      case AgentToolName.LIST_BRANDS:
        return this.workspaceHandler.listBrands(ctx);

      case AgentToolName.GET_CURRENT_BRAND:
        return this.workspaceHandler.getCurrentBrand(ctx);

      case AgentToolName.LIST_POSTS:
        return this.workspaceHandler.listPosts(params, ctx);

      case AgentToolName.CREATE_POST:
        return this.publishHandler.createPost(params, ctx);

      case AgentToolName.SCHEDULE_POST:
        return this.publishHandler.schedulePost(params, ctx);

      case AgentToolName.INSTALL_OFFICIAL_WORKFLOW:
        return this.workflowHandler.installOfficialWorkflow(params, ctx);

      case AgentToolName.LIST_WORKFLOWS:
        return this.workflowHandler.listWorkflows(params, ctx);

      case AgentToolName.INSPECT_WORKFLOW:
        return this.workflowHandler.inspectWorkflow(params, ctx);

      case AgentToolName.DUPLICATE_WORKFLOW:
        return this.workflowHandler.duplicateWorkflow(params, ctx);

      case AgentToolName.CREATE_WORKFLOW:
        return this.workflowHandler.createWorkflow(params, ctx);

      case AgentToolName.CREATE_LIVESTREAM_BOT:
        return this.livestreamHandler.createLivestreamBot(params, ctx);

      case AgentToolName.MANAGE_LIVESTREAM_BOT:
        return this.livestreamHandler.manageLivestreamBot(params, ctx);

      case AgentToolName.EXECUTE_WORKFLOW:
        return this.workflowHandler.executeWorkflow(params, ctx);

      case AgentToolName.SET_WORKFLOW_SCHEDULE:
        return this.workflowHandler.setWorkflowSchedule(params, ctx);

      case AgentToolName.LIST_WORKFLOW_RUNS:
        return this.workflowHandler.listWorkflowRuns(params, ctx);

      case AgentToolName.GET_WORKFLOW_RUN:
        return this.workflowHandler.getWorkflowRun(params, ctx);

      case AgentToolName.GET_WORKFLOW_INPUTS:
        return this.workflowHandler.getWorkflowInputs(params, ctx);

      case AgentToolName.GET_ANALYTICS:
        return this.analyticsHandler.getAnalytics(params, ctx);

      case AgentToolName.GET_CONNECTION_STATUS:
        return this.connectionHandler.getConnectionStatus(params, ctx);

      case AgentToolName.INITIATE_OAUTH_CONNECT:
        return this.connectionHandler.initiateOAuthConnect(params, ctx);

      case AgentToolName.GET_TRENDS:
        return this.trendsHandler.getTrends(params, ctx);

      case AgentToolName.LIST_ADS_RESEARCH:
        return this.adsResearchHandler.listAdsResearch(params, ctx);

      case AgentToolName.GET_AD_RESEARCH_DETAIL:
        return this.adsResearchHandler.getAdResearchDetail(params, ctx);

      case AgentToolName.CREATE_AD_REMIX_WORKFLOW:
        return this.adsResearchHandler.createAdRemixWorkflow(params, ctx);

      case AgentToolName.GENERATE_AD_PACK:
        return this.adsResearchHandler.generateAdPack(params, ctx);

      case AgentToolName.PREPARE_AD_LAUNCH_REVIEW:
        return this.adsResearchHandler.prepareAdLaunchReview(params, ctx);

      case AgentToolName.AI_ACTION:
        return this.mediaGenerationHandler.aiAction(params, ctx);

      case AgentToolName.GENERATE_CONTENT:
        return this.mediaGenerationHandler.generateContent(params, ctx);

      case AgentToolName.GENERATE_IMAGE:
        return this.mediaGenerationHandler.generateImage(params, ctx);

      case AgentToolName.REFRAME_IMAGE:
        return this.mediaGenerationHandler.reframeImage(params, ctx);

      case AgentToolName.UPSCALE_IMAGE:
        return this.mediaGenerationHandler.upscaleImage(params, ctx);

      case AgentToolName.GENERATE_VIDEO:
        return this.mediaGenerationHandler.generateVideo(params, ctx);

      case AgentToolName.GENERATE_MUSIC:
        return this.mediaGenerationHandler.generateMusic(params, ctx);

      case AgentToolName.GENERATE_VOICE:
        return this.mediaGenerationHandler.generateVoice(params, ctx);

      case AgentToolName.OPEN_STUDIO_HANDOFF:
        return this.workspaceHandler.openStudioHandoff(params);

      case AgentToolName.GENERATE_CONTENT_BATCH:
        return this.mediaGenerationHandler.generateContentBatch(params, ctx);

      case AgentToolName.RESOLVE_HANDLE:
        return this.connectionHandler.resolveHandle(params, ctx);

      case AgentToolName.LIST_REVIEW_QUEUE:
        return this.reviewHandler.listReviewQueue(params, ctx);

      case AgentToolName.BATCH_APPROVE_REJECT:
        return this.reviewHandler.batchApproveReject(params, ctx);

      case AgentToolName.CREATE_CAMPAIGN:
        return this.campaignHandler.createCampaign(params, ctx);

      case AgentToolName.START_CAMPAIGN:
        return this.campaignHandler.startCampaign(params, ctx);

      case AgentToolName.PAUSE_CAMPAIGN:
        return this.campaignHandler.pauseCampaign(params, ctx);

      case AgentToolName.COMPLETE_CAMPAIGN:
        return this.campaignHandler.completeCampaign(params, ctx);

      case AgentToolName.GET_CAMPAIGN_ANALYTICS:
        return this.campaignHandler.getCampaignAnalytics(params, ctx);

      // Onboarding tools
      case AgentToolName.CREATE_BRAND:
        return this.onboardingHandler.createBrand(params, ctx);

      case AgentToolName.CHECK_ONBOARDING_STATUS:
        return this.onboardingHandler.checkOnboardingStatus(ctx);

      case AgentToolName.COMPLETE_ONBOARDING:
        return this.onboardingHandler.completeOnboarding(ctx);

      case AgentToolName.CONNECT_SOCIAL_ACCOUNT:
        return this.onboardingHandler.connectSocialAccount(params, ctx);

      case AgentToolName.GENERATE_ONBOARDING_CONTENT:
        return this.onboardingHandler.generateOnboardingContent(params, ctx);

      case AgentToolName.PRESENT_PAYMENT_OPTIONS:
        return this.onboardingHandler.presentPaymentOptions(ctx);

      case AgentToolName.GENERATE_MONTHLY_CONTENT:
        return this.generateMonthlyContent(params, ctx);

      case AgentToolName.DRAFT_BRAND_VOICE_PROFILE:
        return this.draftBrandVoiceProfile(params, ctx);

      case AgentToolName.SAVE_BRAND_VOICE_PROFILE:
        return this.saveBrandVoiceProfile(params, ctx);

      // Proactive agent tools
      case AgentToolName.DISCOVER_ENGAGEMENTS:
        return this.proactiveHandler.discoverEngagements(params, ctx);

      case AgentToolName.DRAFT_ENGAGEMENT_REPLY:
        return this.proactiveHandler.draftEngagementReply(params, ctx);

      case AgentToolName.GET_APPROVAL_SUMMARY:
        return this.proactiveHandler.getApprovalSummary(ctx);

      case AgentToolName.ANALYZE_PERFORMANCE:
        return this.proactiveHandler.analyzePerformance(params, ctx);

      case AgentToolName.GET_CONTENT_CALENDAR:
        return this.proactiveHandler.getContentCalendar(params, ctx);

      case AgentToolName.UPDATE_STRATEGY_STATE:
        return this.proactiveHandler.updateStrategyState(params, ctx);

      // Identity tools
      case AgentToolName.GENERATE_AS_IDENTITY:
        return this.mediaGenerationHandler.generateAsIdentity(params, ctx);

      // Dashboard tools
      case AgentToolName.RENDER_DASHBOARD:
        return this.renderDashboard(params, ctx);
      case AgentToolName.SAVE_DASHBOARD_LAYOUT:
        return this.dashboardHandler.saveDashboardLayout(params, ctx);
      case AgentToolName.GET_DASHBOARD_LAYOUT:
        return this.dashboardHandler.getDashboardLayout(params, ctx);

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
      case AgentToolName.RATE_CONTENT:
        return this.qualityHandler.rateContent(params, ctx);

      // SEO scoring
      case AgentToolName.SCORE_SEO:
        return this.qualityHandler.scoreSeo(params, ctx);

      // Ingredient voting & replication tools
      case AgentToolName.RATE_INGREDIENT:
        return this.qualityHandler.rateIngredient(params, ctx);

      case AgentToolName.GET_TOP_INGREDIENTS:
        return this.qualityHandler.getTopIngredients(params, ctx);

      case AgentToolName.REPLICATE_TOP_INGREDIENT:
        return this.qualityHandler.replicateTopIngredient(params, ctx);

      case AgentToolName.CAPTURE_MEMORY:
        return this.memoryGoalsHandler.captureMemory(params, ctx);

      case AgentToolName.CREATE_GOAL:
        return this.memoryGoalsHandler.createGoal(params, ctx);

      case AgentToolName.CHECK_GOAL_PROGRESS:
        return this.memoryGoalsHandler.checkGoalProgress(params, ctx);

      case AgentToolName.UPDATE_GOAL:
        return this.memoryGoalsHandler.updateGoal(params, ctx);

      // Brand context interview tools
      case AgentToolName.START_BRAND_INTERVIEW:
        return this.brandInterviewHandler.startBrandInterview(params, ctx);

      case AgentToolName.SUBMIT_BRAND_INTERVIEW_ANSWER:
        return this.brandInterviewHandler.submitBrandInterviewAnswer(
          params,
          ctx,
        );

      case AgentToolName.SKIP_BRAND_INTERVIEW_QUESTION:
        return this.brandInterviewHandler.skipBrandInterviewQuestion(
          params,
          ctx,
        );

      case AgentToolName.GET_BRAND_COMPLETENESS:
        return this.brandInterviewHandler.getBrandCompleteness(params, ctx);

      default:
        return {
          creditsUsed: 0,
          error: `Unknown tool: ${toolName as string}`,
          success: false,
        };
    }
  }

  // READ-ONLY TOOLS (0 credits)

  private async listGenfeedTools(
    params: Record<string, unknown>,
  ): Promise<AgentToolResult> {
    const surface = this.readToolCatalogSurface(params.surface);
    const role = this.readToolRequiredRole(params.role);
    const category = this.readToolCategory(params.category);
    const includeParameters = params.includeParameters === true;
    const limit = this.readToolCatalogLimit(params.limit);
    const query = readOptionalString(params.query)?.toLowerCase();

    let tools = this.resolveToolCatalogTools(surface, role);

    if (category) {
      tools = tools.filter((tool) => tool.category === category);
    }

    if (query) {
      tools = tools.filter(
        (tool) =>
          tool.name.toLowerCase().includes(query) ||
          tool.description.toLowerCase().includes(query),
      );
    }

    const total = tools.length;
    const visibleTools = tools.slice(0, limit);

    return {
      creditsUsed: 0,
      data: {
        availableFilters: {
          categories: TOOL_CATALOG_CATEGORIES,
          roles: TOOL_CATALOG_ROLES,
          surfaces: ['agent', 'mcp', 'cli', 'all'],
        },
        category: category ?? null,
        counts: this.buildToolCatalogCounts(role),
        includeParameters,
        query: query ?? null,
        returned: visibleTools.length,
        role,
        surface,
        tools: visibleTools.map((tool) =>
          this.serializeToolCatalogRow(tool, includeParameters),
        ),
        total,
        truncated: total > visibleTools.length,
      },
      success: true,
    };
  }

  private resolveToolCatalogTools(
    surface: ToolCatalogSurface,
    role: ToolRequiredRole,
  ): CanonicalToolDefinition[] {
    if (surface !== 'all') {
      return getToolsForRole(surface, role);
    }

    const toolsByName = new Map<string, CanonicalToolDefinition>();
    for (const itemSurface of TOOL_CATALOG_SURFACES) {
      for (const tool of getToolsForRole(itemSurface, role)) {
        toolsByName.set(tool.name, tool);
      }
    }

    return [...toolsByName.values()].sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }

  private buildToolCatalogCounts(role: ToolRequiredRole): {
    byCategory: Record<string, number>;
    bySurface: Record<(typeof TOOL_CATALOG_SURFACES)[number], number>;
    total: number;
  } {
    const allTools = this.resolveToolCatalogTools('all', role);
    return {
      byCategory: Object.fromEntries(
        TOOL_CATALOG_CATEGORIES.map((category) => [
          category,
          allTools.filter((tool) => tool.category === category).length,
        ]),
      ),
      bySurface: {
        agent: getToolsForRole('agent', role).length,
        cli: getToolsForRole('cli', role).length,
        mcp: getToolsForRole('mcp', role).length,
      },
      total: allTools.length,
    };
  }

  private serializeToolCatalogRow(
    tool: CanonicalToolDefinition,
    includeParameters: boolean,
  ): Record<string, unknown> {
    return {
      category: tool.category,
      creditCost: tool.creditCost,
      description: tool.description,
      name: tool.name,
      ...(includeParameters ? { parameters: tool.parameters } : {}),
      requiredRole: tool.requiredRole,
      surfaces: tool.surfaces,
    };
  }

  private readToolCatalogSurface(value: unknown): ToolCatalogSurface {
    return value === 'agent' ||
      value === 'mcp' ||
      value === 'cli' ||
      value === 'all'
      ? value
      : 'all';
  }

  private readToolRequiredRole(value: unknown): ToolRequiredRole {
    return value === 'admin' || value === 'superadmin' || value === 'user'
      ? value
      : 'user';
  }

  private readToolCategory(value: unknown): ToolCategory | undefined {
    return typeof value === 'string' &&
      (TOOL_CATALOG_CATEGORIES as string[]).includes(value)
      ? (value as ToolCategory)
      : undefined;
  }

  private readToolCatalogLimit(value: unknown): number {
    const explicitLimit = readOptionalNumber(value);
    if (explicitLimit === undefined) {
      return 80;
    }

    return Math.max(1, Math.min(200, Math.floor(explicitLimit)));
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
      typeof params.brandId === 'string'
        ? params.brandId
        : typeof ctx.brandId === 'string'
          ? ctx.brandId
          : null;

    if (explicitBrandId) {
      return this.brandsService.findOne({
        _id: explicitBrandId,
        isDeleted: false,
        organization: ctx.organizationId,
      });
    }

    return this.brandsService.findOne({
      isDeleted: false,
      organization: ctx.organizationId,
    });
  }

  private formatBrandVoiceProfile(
    profile: Partial<BrandVoiceProfileDraft>,
  ): string {
    const sections = [
      `Tone: ${profile.tone || 'Not set'}`,
      `Style: ${profile.style || 'Not set'}`,
      `Audience: ${profile.audience?.join(', ') || 'Not set'}`,
      `Messaging pillars: ${profile.messagingPillars?.join(', ') || 'Not set'}`,
      `Topics: ${profile.strategy?.topics.join(', ') || 'Not set'}`,
      `Content goals: ${profile.strategy?.goals.join(', ') || 'Not set'}`,
      `Core values: ${profile.values?.join(', ') || 'Not set'}`,
      `Avoid: ${profile.doNotSoundLike?.join(', ') || 'Not set'}`,
      `Taglines: ${profile.taglines?.join(', ') || 'Not set'}`,
      `Hashtags: ${profile.hashtags?.join(', ') || 'Not set'}`,
      `Conversation starters: ${profile.prompting?.conversationStarters.map((starter) => starter.label).join(', ') || 'Not set'}`,
      `Sample output:\n${profile.sampleOutput || 'Not set'}`,
    ];

    return sections.join('\n\n');
  }

  private normalizeBrandPrompting(
    value: unknown,
  ): IBrandAgentPrompting | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return undefined;
    }

    const record = value as Record<string, unknown>;
    const seeds = Array.isArray(record.seeds)
      ? record.seeds
          .flatMap((entry) => {
            if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
              return [];
            }
            const seed = entry as Record<string, unknown>;
            const topic =
              typeof seed.topic === 'string' ? seed.topic.trim() : '';
            if (!topic) {
              return [];
            }
            return [
              {
                angle: typeof seed.angle === 'string' ? seed.angle.trim() : '',
                audience:
                  typeof seed.audience === 'string' ? seed.audience.trim() : '',
                preferredFormats: this.normalizeStringList(
                  seed.preferredFormats,
                ).slice(0, 3),
                topic,
              },
            ];
          })
          .slice(0, 6)
      : [];
    const conversationStarters = Array.isArray(record.conversationStarters)
      ? record.conversationStarters
          .flatMap<IBrandConversationStarter>((entry) => {
            if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
              return [];
            }
            const starter = entry as Record<string, unknown>;
            const intent = starter.intent;
            const label =
              typeof starter.label === 'string' ? starter.label.trim() : '';
            const prompt =
              typeof starter.prompt === 'string' ? starter.prompt.trim() : '';
            const topic =
              typeof starter.topic === 'string' ? starter.topic.trim() : '';
            if (
              (intent !== 'analyze' &&
                intent !== 'create' &&
                intent !== 'plan') ||
              !label ||
              !prompt ||
              !topic
            ) {
              return [];
            }
            return [
              {
                id:
                  typeof starter.id === 'string' && starter.id.trim()
                    ? starter.id.trim()
                    : `brand-${intent}-${topic.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
                intent,
                label: label.slice(0, 32),
                prompt: prompt.slice(0, 220),
                topic,
              },
            ];
          })
          .slice(0, 3)
      : [];

    return seeds.length > 0 && conversationStarters.length > 0
      ? { conversationStarters, seeds }
      : undefined;
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
    if (!brand?.id) {
      return {
        creditsUsed: 0,
        error: 'Create or select a brand before drafting brand voice.',
        success: false,
      };
    }

    const profile = await this.brandsService.generateBrandVoice(
      {
        brandId: String(brand.id),
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
        brandId: String(brand.id),
        brandName:
          typeof brand.label === 'string' && brand.label.trim()
            ? brand.label.trim()
            : 'Selected brand',
        voiceProfile: profile,
      },
      nextActions: [
        {
          brandId: String(brand.id),
          ctas: [
            {
              action: 'confirm_save_brand_voice_profile',
              label: 'Approve and save',
              payload: {
                brandId: String(brand.id),
                voiceProfile: profile,
              },
            },
          ],
          data: { voiceProfile: profile },
          description:
            'Review this draft. Ask for changes in chat, or approve to save it to the brand.',
          id: `brand-voice-profile-${String(brand.id)}`,
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
    if (!brand?.id) {
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
      prompting: this.normalizeBrandPrompting(rawProfile.prompting),
      sampleOutput:
        typeof rawProfile.sampleOutput === 'string'
          ? rawProfile.sampleOutput.trim()
          : '',
      style:
        typeof rawProfile.style === 'string' ? rawProfile.style.trim() : '',
      taglines: this.normalizeStringList(rawProfile.taglines),
      strategy:
        rawProfile.strategy &&
        typeof rawProfile.strategy === 'object' &&
        !Array.isArray(rawProfile.strategy)
          ? {
              goals: this.normalizeStringList(
                (rawProfile.strategy as Record<string, unknown>).goals,
              ),
              topics: this.normalizeStringList(
                (rawProfile.strategy as Record<string, unknown>).topics,
              ),
            }
          : undefined,
      tone: typeof rawProfile.tone === 'string' ? rawProfile.tone.trim() : '',
      values: this.normalizeStringList(rawProfile.values),
      writingRules: this.normalizeStringList(rawProfile.writingRules),
    };

    const existingAgentConfig =
      brand.agentConfig &&
      typeof brand.agentConfig === 'object' &&
      !Array.isArray(brand.agentConfig)
        ? (brand.agentConfig as Record<string, unknown>)
        : {};
    const existingStrategy =
      existingAgentConfig.strategy &&
      typeof existingAgentConfig.strategy === 'object' &&
      !Array.isArray(existingAgentConfig.strategy)
        ? (existingAgentConfig.strategy as Record<string, unknown>)
        : {};

    await this.brandsService.updateAgentConfig(
      String(brand.id),
      ctx.organizationId,
      {
        ...(profile.prompting ? { prompting: profile.prompting } : {}),
        ...(profile.strategy
          ? { strategy: { ...existingStrategy, ...profile.strategy } }
          : {}),
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
        brandId: String(brand.id),
        saved: true,
        voiceProfile: profile,
      },
      success: true,
    };
  }

  // AI TOOLS — call real LLM services

  // ──────────────────────────────────────────────
  // IDENTITY TOOLS
  // ──────────────────────────────────────────────

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
    if (normalizedOperation === undefined) {
      return {
        creditsUsed: 0,
        error: `Unsupported dashboard operation: ${operation ?? 'missing'}`,
        success: false,
      };
    }
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
  ): AgentDashboardOperation | undefined {
    if (
      operation === 'replace' ||
      operation === 'add' ||
      operation === 'update' ||
      operation === 'remove' ||
      operation === 'clear'
    ) {
      return operation;
    }

    return undefined;
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
      category: { in: categoryFilter },
      status: IngredientStatus.GENERATED,
    };

    if (params.brandId) {
      baseFilters.brand = params.brandId as string;
    }

    type AssetDoc = {
      id: unknown;
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
      const id = String(asset.id);
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
      {
        where: {
          isDeleted: false,
          organization: ctx.organizationId,
        },
        orderBy: { updatedAt: -1 },
      },
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
          id: String(workflow.id),
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
        organization: ctx.organizationId,
        user: ctx.userId,
      },
      'none',
    );

    const orgSettings = this.organizationSettingsService
      ? await this.organizationSettingsService.findOne({
          isDeleted: false,
          organization: ctx.organizationId,
        })
      : null;

    const clonedVoices = this.voicesService
      ? await this.voicesService.findAll(
          {
            where: scopedWhere(ctx.organizationId, { isCloned: true }),
            orderBy: { createdAt: -1 },
          },
          {},
        )
      : { docs: [] };

    const existingVoices =
      clonedVoices.docs?.map((voice: unknown) => {
        const v = voice as Record<string, unknown>;
        return {
          cloneStatus: (v.cloneStatus as string | undefined) ?? undefined,
          id: String(v.id),
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
    const effectiveDefaultVoiceId =
      effectiveBrandAgentConfig.identityDefaults.effective.defaultVoiceId?.toString();

    const recommendedVoiceId = effectiveDefaultVoiceId || readyVoices[0]?.id;

    return {
      creditsUsed: 0,
      nextActions: [
        {
          brandId: currentBrand
            ? String((currentBrand as { id: unknown }).id)
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

  private resolveClipWorkflowIdentity(
    params: Record<string, unknown>,
    brand: unknown,
    organizationSettings: unknown,
  ): AgentClipRunIdentity {
    return resolveClipIdentity({
      avatarId:
        readOptionalString(params.avatarId) ??
        readOptionalString(params.heygenAvatarId),
      avatarProvider: readOptionalString(params.avatarProvider),
      brand,
      organizationSettings,
      voiceId:
        readOptionalString(params.voiceId) ??
        readOptionalString(params.heygenVoiceId),
      voiceProvider: readOptionalString(params.voiceProvider),
    });
  }

  private buildClipIdentityInputValues(
    identity: AgentClipRunIdentity,
  ): Record<string, unknown> {
    const values: Record<string, unknown> = {
      identitySource: identity.source,
      identityStatus: identity.isComplete ? 'ready' : 'missing_identity',
      missingIdentity: identity.missing,
      useIdentity: identity.useIdentity,
    };

    if (identity.avatarId) {
      values.avatarId = identity.avatarId;
      values.avatarProvider = identity.avatarProvider ?? VoiceProvider.HEYGEN;

      if (
        (identity.avatarProvider ?? VoiceProvider.HEYGEN) ===
        VoiceProvider.HEYGEN
      ) {
        values.heygenAvatarId = identity.avatarId;
      }
    }

    if (identity.voiceId) {
      values.voiceId = identity.voiceId;
      values.voiceProvider = identity.voiceProvider ?? VoiceProvider.HEYGEN;

      if (
        (identity.voiceProvider ?? VoiceProvider.HEYGEN) ===
        VoiceProvider.HEYGEN
      ) {
        values.heygenVoiceId = identity.voiceId;
      }
    }

    return values;
  }

  private async prepareClipWorkflowRun(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const currentBrand = await this.brandsService.findOne(
      {
        isDeleted: false,
        isSelected: true,
        organization: ctx.organizationId,
        user: ctx.userId,
      },
      'none',
    );
    const selectedBrandId = currentBrand
      ? String((currentBrand as Record<string, unknown>).id)
      : null;
    const orgSettings = this.organizationSettingsService
      ? await this.organizationSettingsService.findOne({
          isDeleted: false,
          organization: ctx.organizationId,
        })
      : null;
    const identity = this.resolveClipWorkflowIdentity(
      params,
      currentBrand,
      orgSettings,
    );
    const identityInputValues = this.buildClipIdentityInputValues(identity);
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
      {
        where: {
          isDeleted: false,
          organization: ctx.organizationId,
        },
        orderBy: { updatedAt: -1 },
      },
      {},
    );

    const workflowList =
      workflows.docs?.map((w: unknown) => {
        const doc = w as Record<string, unknown>;
        return {
          description:
            typeof doc.description === 'string' ? doc.description : undefined,
          id: String(doc.id),
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
        id: String(wf.id ?? selectedWorkflow),
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
        identity,
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
            identity,
            inputValues: {
              confirmBeforePublish: true,
              duration: durationSeconds,
              format: 'landscape',
              ...identityInputValues,
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
            identity,
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
          description: identity.isComplete
            ? 'Generate a 30-second landscape clip, optionally merge multiple clips, then reframe to portrait for Instagram.'
            : 'Clip identity defaults are incomplete. Add the missing avatar or voice defaults before generating.',
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
}
