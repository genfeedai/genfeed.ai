import { SystemWorkflowRunnerService } from '@api/collections/workflows/system-workflow-runner.service';
import {
  type ApiKeyPublishingContext,
  assertApiKeyAgentPublishingScope as assertScope,
} from '@api/helpers/utils/auth/api-key-publishing-scope.util';
import {
  AgentScopeContextService,
  resolveNestedActionOrigin,
  runWithActionOrigin,
} from '@api/index';
import type {
  AgentGenerationMode,
  AgentGenerationSettings,
} from '@api/services/agent-orchestrator/interfaces/agent-chat.interface';
import { AgentAdsResearchToolHandler } from '@api/services/agent-orchestrator/tools/agent-ads-research-tool-handler.service';
import { AgentAnalyticsToolHandler } from '@api/services/agent-orchestrator/tools/agent-analytics-tool-handler.service';
import { AgentBrandContentToolHandler } from '@api/services/agent-orchestrator/tools/agent-brand-content-tool-handler.service';
import { AgentBrandInterviewToolHandler } from '@api/services/agent-orchestrator/tools/agent-brand-interview-tool-handler.service';
import { AgentCampaignToolHandler } from '@api/services/agent-orchestrator/tools/agent-campaign-tool-handler.service';
import { AgentConnectionToolHandler } from '@api/services/agent-orchestrator/tools/agent-connection-tool-handler.service';
import { AgentDashboardToolHandler } from '@api/services/agent-orchestrator/tools/agent-dashboard-tool-handler.service';
import { AgentInstagramInspirationToolHandler } from '@api/services/agent-orchestrator/tools/agent-instagram-inspiration-tool-handler.service';
import { AgentLivestreamToolHandler } from '@api/services/agent-orchestrator/tools/agent-livestream-tool-handler.service';
import { AgentMediaGenerationToolHandler } from '@api/services/agent-orchestrator/tools/agent-media-generation-tool-handler.service';
import { AgentMemoryGoalsToolHandler } from '@api/services/agent-orchestrator/tools/agent-memory-goals-tool-handler.service';
import { AgentOnboardingToolHandler } from '@api/services/agent-orchestrator/tools/agent-onboarding-tool-handler.service';
import { AgentPrepareToolHandler } from '@api/services/agent-orchestrator/tools/agent-prepare-tool-handler.service';
import { AgentProactiveToolHandler } from '@api/services/agent-orchestrator/tools/agent-proactive-tool-handler.service';
import { AgentPublishToolHandler } from '@api/services/agent-orchestrator/tools/agent-publish-tool-handler.service';
import { AgentQualityToolHandler } from '@api/services/agent-orchestrator/tools/agent-quality-tool-handler.service';
import { AgentReviewToolHandler } from '@api/services/agent-orchestrator/tools/agent-review-tool-handler.service';
import { AgentRouteRewriteService } from '@api/services/agent-orchestrator/tools/agent-route-rewrite.service';
import { AgentSpawnToolHandler } from '@api/services/agent-orchestrator/tools/agent-spawn-tool-handler.service';
import { AgentToolCatalogHandler } from '@api/services/agent-orchestrator/tools/agent-tool-catalog-handler.service';
import { readOptionalString } from '@api/services/agent-orchestrator/tools/agent-tool-parameter-readers';
import {
  AGENT_TOOL_WORKFLOW_DEFINITIONS,
  findAgentToolWorkflowDefinition,
} from '@api/services/agent-orchestrator/tools/agent-tool-workflow-definition';
import { AgentTransferToolHandler } from '@api/services/agent-orchestrator/tools/agent-transfer-tool-handler.service';
import { AgentTrendsToolHandler } from '@api/services/agent-orchestrator/tools/agent-trends-tool-handler.service';
import { AgentWorkflowToolHandler } from '@api/services/agent-orchestrator/tools/agent-workflow-tool-handler.service';
import { AgentWorkspaceToolHandler } from '@api/services/agent-orchestrator/tools/agent-workspace-tool-handler.service';
import { AgentXActionsToolHandler } from '@api/services/agent-orchestrator/tools/agent-x-actions-tool-handler.service';
import { getToolByName } from '@genfeedai/actions';
import {
  ActionOrigin,
  type RouterPriority,
  WorkflowExecutionTrigger,
} from '@genfeedai/enums';
import type {
  AgentToolResult,
  ValidatedAgentScope,
} from '@genfeedai/interfaces';
import { AgentToolName } from '@genfeedai/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, type OnModuleInit, Optional } from '@nestjs/common';

export interface ToolExecutionContext {
  apiKeyContext?: ApiKeyPublishingContext;
  /** URLs of user-attached images from the chat message */
  attachmentUrls?: string[];
  userId: string;
  organizationId: string;
  threadId?: string;
  /** Router request vocabulary — map the persisted setting with `toRouterPriority`. */
  generationPriority?: RouterPriority;
  generationMode?: AgentGenerationMode;
  generationSettings?: AgentGenerationSettings;
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
  /** Owning workflow execution id, used for content attribution */
  runId?: string;
  /** Durable identity of the confirmed conversation action. */
  sourceActionId?: string;
  /** Agent strategy ID for content attribution */
  strategyId?: string;
  /** Keep batch generation attached to the current live run and stream item previews */
  streamBatchToUser?: boolean;
  /** Server-validated immutable organization + mutable brand/version scope. */
  validatedScope?: ValidatedAgentScope;
  /** Server-only proof that this execution came from a confirmed thread UI action. */
  confirmationOrigin?: 'thread-ui-action';
}

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
  AgentToolName.LIST_AGENT_CONVERSATIONS,
  AgentToolName.LIST_BRANDS,
  AgentToolName.LIST_CHARACTERS,
  AgentToolName.LIST_GENFEED_TOOLS,
  AgentToolName.LIST_POSTS,
  AgentToolName.LIST_REVIEW_QUEUE,
  AgentToolName.LIST_SYSTEM_WORKFLOW_CATALOG,
  AgentToolName.LIST_WORKFLOW_RUNS,
  AgentToolName.LIST_WORKFLOWS,
  AgentToolName.PRESENT_PAYMENT_OPTIONS,
  AgentToolName.RENDER_DASHBOARD,
  AgentToolName.RESOLVE_HANDLE,
  AgentToolName.SUGGEST_NEXT_STEPS,
  AgentToolName.TRANSFER_AGENT_CONVERSATION,
]);

/**
 * Thin agent tool router. Tool families live in dedicated handlers (#519).
 */
@Injectable()
export class AgentToolExecutorService implements OnModuleInit {
  private readonly constructorName = String(this.constructor.name);

  constructor(
    private readonly loggerService: LoggerService,
    private readonly routeRewriteService: AgentRouteRewriteService,
    private readonly memoryGoalsHandler: AgentMemoryGoalsToolHandler,
    private readonly dashboardHandler: AgentDashboardToolHandler,
    private readonly publishHandler: AgentPublishToolHandler,
    private readonly campaignHandler: AgentCampaignToolHandler,
    private readonly livestreamHandler: AgentLivestreamToolHandler,
    private readonly instagramInspirationHandler: AgentInstagramInspirationToolHandler,
    private readonly xActionsHandler: AgentXActionsToolHandler,
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
    private readonly catalogHandler: AgentToolCatalogHandler,
    private readonly brandContentHandler: AgentBrandContentToolHandler,
    private readonly prepareHandler: AgentPrepareToolHandler,
    private readonly spawnHandler: AgentSpawnToolHandler,
    @Optional()
    private readonly agentScopeContextService?: AgentScopeContextService,
    @Optional()
    private readonly transferHandler?: AgentTransferToolHandler,
    @Optional()
    private readonly systemWorkflowRunner?: SystemWorkflowRunnerService,
  ) {}

  onModuleInit(): void {
    const runner = this.requireWorkflowRunner();
    for (const toolName of Object.values(AgentToolName)) {
      const definition = getToolByName(toolName);
      if (
        !definition ||
        (!definition.surfaces.agent && !definition.surfaces.mcp)
      ) {
        continue;
      }
      runner.registerAction(
        toolName,
        async ({ context: workflowContext, input, runtimeContext }) => {
          const liveContext =
            runtimeContext &&
            typeof runtimeContext === 'object' &&
            !Array.isArray(runtimeContext)
              ? (runtimeContext as ToolExecutionContext)
              : undefined;
          if (!liveContext) {
            throw new Error(
              `Agent tool ${toolName} requires its authenticated runtime context`,
            );
          }
          const result = await this.executeToolWithActionOrigin(
            toolName,
            input,
            {
              ...liveContext,
              organizationId: workflowContext.organizationId,
              userId: workflowContext.userId,
            },
          );
          // A fail-closed tool result is a completed action that returned a
          // remediation envelope — the workflow node keeps its `data` and
          // `nextActions` instead of collapsing them into a thrown message.
          return result;
        },
      );
    }
    for (const definition of AGENT_TOOL_WORKFLOW_DEFINITIONS) {
      runner.registerWorkflow(definition);
    }
  }

  async executeTool(
    toolName: AgentToolName,
    parameters: Record<string, unknown>,
    context: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    assertScope(context.apiKeyContext ?? {}, toolName, parameters);
    try {
      return await runWithActionOrigin(
        resolveNestedActionOrigin(ActionOrigin.AGENT),
        async () => {
          const definition = findAgentToolWorkflowDefinition(toolName);
          const { result } =
            await this.requireWorkflowRunner().runWorkflow<AgentToolResult>({
              actionType: toolName,
              canonicalId: definition.canonicalId,
              inputValues: {
                parameters,
              },
              metadata: {
                brandId: context.brandId,
                origin: 'agent',
                threadId: context.threadId,
              },
              organizationId: context.organizationId,
              runtimeContext: context,
              source: 'AgentToolExecutorService.executeTool',
              trigger: WorkflowExecutionTrigger.API,
              userId: context.userId,
            });
          return result;
        },
      );
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.loggerService.error(
        `Tool ${toolName} workflow failed: ${errorMessage}`,
        this.constructorName,
      );
      return { creditsUsed: 0, error: errorMessage, success: false };
    }
  }

  private requireWorkflowRunner(): SystemWorkflowRunnerService {
    if (!this.systemWorkflowRunner) {
      throw new Error('Workflow action runner is unavailable');
    }
    return this.systemWorkflowRunner;
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
        : this.xActionsHandler.handles(toolName)
          ? await this.xActionsHandler.execute(toolName, parameters, context)
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
        return this.catalogHandler.listGenfeedTools(params);

      case AgentToolName.LIST_AGENT_CONVERSATIONS:
        return this.transferHandler
          ? this.transferHandler.listConversations(params, ctx)
          : this.unavailableTransferTool();

      case AgentToolName.TRANSFER_AGENT_CONVERSATION:
        return this.transferHandler
          ? this.transferHandler.transfer(params, ctx)
          : this.unavailableTransferTool();

      case AgentToolName.GET_CREDITS_BALANCE:
        return this.workspaceHandler.getCreditsBalance(ctx);

      case AgentToolName.LIST_BRANDS:
        return this.workspaceHandler.listBrands(ctx);

      case AgentToolName.LIST_CHARACTERS:
        return this.workspaceHandler.listCharacters(params, ctx);

      case AgentToolName.GET_CURRENT_BRAND:
        return this.workspaceHandler.getCurrentBrand(ctx);

      case AgentToolName.LIST_POSTS:
        return this.workspaceHandler.listPosts(params, ctx);

      case AgentToolName.CREATE_POST:
        return this.publishHandler.createPost(params, ctx);

      case AgentToolName.SCHEDULE_POST:
        return this.publishHandler.schedulePost(params, ctx);

      case AgentToolName.REPURPOSE_POST:
        return this.publishHandler.repurposePost(params, ctx);

      case AgentToolName.INSTALL_OFFICIAL_WORKFLOW:
        return this.workflowHandler.installOfficialWorkflow(params, ctx);

      case AgentToolName.LIST_SYSTEM_WORKFLOW_CATALOG:
        return this.workflowHandler.listSystemWorkflowCatalog(params, ctx);

      case AgentToolName.INSTALL_SYSTEM_WORKFLOW:
        return this.workflowHandler.installSystemWorkflow(params, ctx);

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

      case AgentToolName.CREATE_OUTREACH_SEQUENCE:
        return this.campaignHandler.createCampaign(params, ctx);

      case AgentToolName.START_OUTREACH_SEQUENCE:
        return this.campaignHandler.startCampaign(params, ctx);

      case AgentToolName.PAUSE_OUTREACH_SEQUENCE:
        return this.campaignHandler.pauseCampaign(params, ctx);

      case AgentToolName.COMPLETE_OUTREACH_SEQUENCE:
        return this.campaignHandler.completeCampaign(params, ctx);

      case AgentToolName.GET_OUTREACH_SEQUENCE_ANALYTICS:
        return this.campaignHandler.getCampaignAnalytics(params, ctx);

      case AgentToolName.CREATE_BRAND:
        return this.onboardingHandler.createBrand(params, ctx);

      case AgentToolName.RENAME_BRAND:
        return this.onboardingHandler.renameBrand(params, ctx);

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
        return this.brandContentHandler.generateMonthlyContent(params, ctx);

      case AgentToolName.DRAFT_BRAND_VOICE_PROFILE:
        return this.brandContentHandler.draftBrandVoiceProfile(params, ctx);

      case AgentToolName.SAVE_BRAND_VOICE_PROFILE:
        return this.brandContentHandler.saveBrandVoiceProfile(params, ctx);

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

      case AgentToolName.GENERATE_AS_IDENTITY:
        return this.mediaGenerationHandler.generateAsIdentity(params, ctx);

      case AgentToolName.RENDER_DASHBOARD:
        return this.dashboardHandler.renderDashboard(params, ctx);

      case AgentToolName.SAVE_DASHBOARD_LAYOUT:
        return this.dashboardHandler.saveDashboardLayout(params, ctx);

      case AgentToolName.GET_DASHBOARD_LAYOUT:
        return this.dashboardHandler.getDashboardLayout(params, ctx);

      case AgentToolName.PREPARE_GENERATION:
        return this.prepareHandler.prepareGeneration(params, ctx);

      case AgentToolName.PREPARE_WORKFLOW_TRIGGER:
        return this.prepareHandler.prepareWorkflowTrigger(params, ctx);

      case AgentToolName.PREPARE_VOICE_CLONE:
        return this.prepareHandler.prepareVoiceClone(ctx, params);

      case AgentToolName.PREPARE_CLIP_WORKFLOW_RUN:
        return this.prepareHandler.prepareClipWorkflowRun(params, ctx);

      case AgentToolName.SUGGEST_INGREDIENT_ALTERNATIVES:
        return this.qualityHandler.suggestIngredientAlternatives(params);

      case AgentToolName.SUGGEST_NEXT_STEPS:
        return this.prepareHandler.suggestNextSteps(params);

      case AgentToolName.SPAWN_CONTENT_AGENT:
        return this.spawnHandler.spawnContentAgent(params, ctx);

      case AgentToolName.SELECT_INGREDIENT:
        return this.qualityHandler.selectIngredient(params, ctx);

      case AgentToolName.REQUEST_ASSET:
        return this.spawnHandler.requestAsset(params, ctx);

      case AgentToolName.RATE_CONTENT:
        return this.qualityHandler.rateContent(params, ctx);

      case AgentToolName.SCORE_SEO:
        return this.qualityHandler.scoreSeo(params, ctx);

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

  private unavailableTransferTool(): AgentToolResult {
    return {
      creditsUsed: 0,
      error: 'Conversation transfer tools are unavailable.',
      success: false,
    };
  }
}
