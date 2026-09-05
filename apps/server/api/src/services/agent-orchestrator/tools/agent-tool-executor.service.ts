import type { McpApprovalDocument } from '@api/collections/mcp-approvals/schemas/mcp-approval.schema';
import { McpApprovalsService } from '@api/collections/mcp-approvals/services/mcp-approvals.service';
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
import type { AgentMutationAuthorization } from '@api/services/agent-orchestrator/tools/agent-tool-mutation-policy.types';
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
import type { CuratedActionName } from '@genfeedai/actions';
import {
  buildLogicalWriteKey,
  evaluateMutationPolicy,
  getToolByName,
  getToolsForSurface,
} from '@genfeedai/actions';
import {
  ActionOrigin,
  type RouterPriority,
  WorkflowExecutionTrigger,
} from '@genfeedai/contracts';
import type {
  AgentToolResult,
  ValidatedAgentScope,
} from '@genfeedai/contracts/interfaces';

import { McpApprovalStatus } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, type OnModuleInit, Optional } from '@nestjs/common';
import { toPlainJson } from '@serializers/helpers/plain-json.helper';

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
  /**
   * Whether this invoking host can persist and resume an approval.
   * Web agent turns are true; CLI and bare HTTP execute are false.
   * Unspecified leaves current handler behavior for unit tests.
   */
  hostSupportsApproval?: boolean;
  /** Already-claimed MCP/tool approval that authorizes this exact logical write. */
  approvedApprovalId?: string;
}

const BRANDLESS_AGENT_TOOLS = new Set<CuratedActionName>([
  'analyze_performance',
  'check_goal_progress',
  'check_onboarding_status',
  'create_brand',
  'get_ad_research_detail',
  'get_analytics',
  'get_approval_summary',
  'get_connection_status',
  'get_content_calendar',
  'get_credits_balance',
  'get_dashboard_layout',
  'get_top_ingredients',
  'get_trends',
  'get_workflow_inputs',
  'get_workflow_run',
  'generate_image',
  'generate_video',
  'inspect_workflow',
  'list_ads_research',
  'list_agent_conversations',
  'list_brands',
  'list_characters',
  'list_genfeed_tools',
  'list_posts',
  'list_review_queue',
  'list_system_workflow_catalog',
  'list_workflow_runs',
  'list_workflows',
  'present_payment_options',
  'render_dashboard',
  'resolve_handle',
  'suggest_next_steps',
  'transfer_agent_conversation',
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
    @Optional()
    private readonly mcpApprovalsService?: McpApprovalsService,
  ) {}

  onModuleInit(): void {
    const runner = this.requireWorkflowRunner();
    for (const toolName of getToolsForSurface('agent').map(
      (tool) => tool.name,
    )) {
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
    toolName: CuratedActionName,
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
    toolName: CuratedActionName,
    parameters: Record<string, unknown>,
    context: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const startTime = Date.now();
    let executionApprovalId: string | undefined;
    try {
      const policyResult = await this.applyMutationPolicy(
        toolName,
        parameters,
        context,
      );
      if (policyResult.kind === 'return') {
        return policyResult.result;
      }
      executionApprovalId = policyResult.approvalId;

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
      await this.recordApprovedMutationResult(
        executionApprovalId,
        context.organizationId,
        scopedResult,
      );
      const durationMs = Date.now() - startTime;

      this.loggerService.log(
        `Tool ${toolName} executed in ${durationMs}ms`,
        this.constructorName,
      );

      return toPlainJson(scopedResult);
    } catch (error: unknown) {
      const durationMs = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      this.loggerService.error(
        `Tool ${toolName} failed after ${durationMs}ms: ${errorMessage}`,
        this.constructorName,
      );

      const result = { creditsUsed: 0, error: errorMessage, success: false };
      await this.recordApprovedMutationResult(
        executionApprovalId,
        context.organizationId,
        result,
      );
      return result;
    }
  }

  private async applyMutationPolicy(
    toolName: CuratedActionName,
    parameters: Record<string, unknown>,
    context: ToolExecutionContext,
  ): Promise<AgentMutationAuthorization> {
    if (
      context.hostSupportsApproval === undefined &&
      !context.approvedApprovalId
    ) {
      return { kind: 'execute' };
    }

    const definition = getToolByName(toolName);
    const isAvailableOnSurface = Boolean(
      definition?.surfaces.agent || definition?.surfaces.mcp,
    );
    const idempotencyKey = buildLogicalWriteKey({
      arguments: parameters,
      organizationId: context.organizationId,
      threadId: context.threadId,
      toolName,
      userId: context.userId,
    });
    const existing =
      context.approvedApprovalId && this.mcpApprovalsService
        ? await this.mcpApprovalsService.findOwned(
            context.approvedApprovalId,
            context.organizationId,
          )
        : this.mcpApprovalsService
          ? await this.mcpApprovalsService.findActiveByIdempotencyKey(
              context.organizationId,
              idempotencyKey,
            )
          : null;
    const hasTrustedApproval = this.hasTrustedMutationApproval(
      toolName,
      parameters,
      context,
      existing,
    );
    const decision = evaluateMutationPolicy({
      existing: existing
        ? {
            result: (existing.result as Record<string, unknown> | null) ?? null,
            status: existing.status as 'APPROVED' | 'DECLINED' | 'PENDING',
          }
        : undefined,
      hasTrustedApproval,
      hostSupportsApproval: context.hostSupportsApproval,
      isAvailableOnSurface,
      policy: definition?.mutationPolicy,
    });

    if (decision.kind === 'execute') {
      if (definition?.mutationPolicy !== 'approval-required') {
        return { kind: 'execute' };
      }
      return this.claimApprovedMutation(
        toolName,
        parameters,
        context,
        existing,
      );
    }

    if (decision.kind === 'replay') {
      if (
        typeof decision.result.success !== 'boolean' ||
        typeof decision.result.creditsUsed !== 'number'
      ) {
        throw new Error('Stored approval result is not a valid agent result');
      }
      return {
        kind: 'return',
        result: {
          ...decision.result,
          approvalId: existing?.id,
          approvalStatus: 'approved',
          creditsUsed: 0,
          mutationPolicy: 'approval-required',
          success: decision.result.success,
        },
      };
    }

    if (decision.kind === 'reject') {
      return {
        kind: 'return',
        result: {
          creditsUsed: 0,
          error: decision.error,
          mutationPolicy: definition?.mutationPolicy,
          success: false,
        },
      };
    }

    const approval = this.mcpApprovalsService
      ? await this.mcpApprovalsService.createPending(
          context.organizationId,
          context.userId,
          toolName,
          parameters,
          { threadId: context.threadId },
        )
      : null;

    return {
      kind: 'return',
      result: {
        approvalId: approval?.id,
        approvalStatus: 'pending',
        creditsUsed: 0,
        data: {
          approvalId: approval?.id,
          mutationPolicy: 'approval-required',
          status: 'pending',
          toolName,
        },
        mutationPolicy: 'approval-required',
        requiresConfirmation: true,
        success: true,
      },
    };
  }

  private async claimApprovedMutation(
    toolName: CuratedActionName,
    parameters: Record<string, unknown>,
    context: ToolExecutionContext,
    existing: McpApprovalDocument | null,
  ): Promise<AgentMutationAuthorization> {
    if (!this.mcpApprovalsService)
      throw new Error('Approval service unavailable');
    const approval =
      existing ??
      (await this.mcpApprovalsService.createPending(
        context.organizationId,
        context.userId,
        toolName,
        parameters,
        { threadId: context.threadId },
      ));
    if (approval.status === McpApprovalStatus.PENDING) {
      await this.mcpApprovalsService.resolve(
        approval.id,
        context.organizationId,
        'approve',
        undefined,
        context.apiKeyContext,
      );
    }
    if (
      !(await this.mcpApprovalsService.claimExecution(
        approval.id,
        context.organizationId,
      ))
    ) {
      throw new Error(
        'Approved mutation is already executing or awaiting outcome reconciliation',
      );
    }
    return { kind: 'execute', approvalId: approval.id };
  }

  private hasTrustedMutationApproval(
    toolName: CuratedActionName,
    parameters: Record<string, unknown>,
    context: ToolExecutionContext,
    claimed: McpApprovalDocument | null,
  ): boolean {
    if (context.approvedApprovalId) {
      if (
        !claimed ||
        claimed.status !== McpApprovalStatus.APPROVED ||
        claimed.toolName !== toolName ||
        claimed.isDeleted ||
        !claimed.arguments ||
        typeof claimed.arguments !== 'object' ||
        Array.isArray(claimed.arguments)
      ) {
        throw new Error(
          'Approval does not authorize this exact tool invocation',
        );
      }
      const invocation = {
        organizationId: context.organizationId,
        toolName,
        userId: claimed.userId,
      };
      if (
        buildLogicalWriteKey({
          ...invocation,
          arguments: claimed.arguments,
        }) !== buildLogicalWriteKey({ ...invocation, arguments: parameters })
      ) {
        throw new Error(
          'Approval does not authorize this exact tool invocation',
        );
      }
      return true;
    }
    return context.confirmationOrigin === 'thread-ui-action';
  }

  private async recordApprovedMutationResult(
    approvalId: string | undefined,
    organizationId: string,
    result: AgentToolResult,
  ): Promise<void> {
    if (!approvalId || !this.mcpApprovalsService) return;
    await this.mcpApprovalsService.attachResult(
      approvalId,
      organizationId,
      toPlainJson({ ...result }),
    );
  }

  private assertToolBrandScope(
    toolName: CuratedActionName,
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
    toolName: CuratedActionName,
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    switch (toolName) {
      case 'list_genfeed_tools':
        return this.catalogHandler.listGenfeedTools(params);

      case 'list_agent_conversations':
        return this.transferHandler
          ? this.transferHandler.listConversations(params, ctx)
          : this.unavailableTransferTool();

      case 'transfer_agent_conversation':
        return this.transferHandler
          ? this.transferHandler.transfer(params, ctx)
          : this.unavailableTransferTool();

      case 'get_credits_balance':
        return this.workspaceHandler.getCreditsBalance(ctx);

      case 'list_brands':
        return this.workspaceHandler.listBrands(ctx);

      case 'list_characters':
        return this.workspaceHandler.listCharacters(params, ctx);

      case 'get_current_brand':
        return this.workspaceHandler.getCurrentBrand(ctx);

      case 'list_posts':
        return this.workspaceHandler.listPosts(params, ctx);

      case 'create_post':
        return this.publishHandler.createPost(params, ctx);

      case 'schedule_post':
        return this.publishHandler.schedulePost(params, ctx);

      case 'repurpose_post':
        return this.publishHandler.repurposePost(params, ctx);

      case 'install_official_workflow':
        return this.workflowHandler.installOfficialWorkflow(params, ctx);

      case 'list_system_workflow_catalog':
        return this.workflowHandler.listSystemWorkflowCatalog(params, ctx);

      case 'install_system_workflow':
        return this.workflowHandler.installSystemWorkflow(params, ctx);

      case 'list_workflows':
        return this.workflowHandler.listWorkflows(params, ctx);

      case 'inspect_workflow':
        return this.workflowHandler.inspectWorkflow(params, ctx);

      case 'duplicate_workflow':
        return this.workflowHandler.duplicateWorkflow(params, ctx);

      case 'create_workflow':
        return this.workflowHandler.createWorkflow(params, ctx);

      case 'create_livestream_bot':
        return this.livestreamHandler.createLivestreamBot(params, ctx);

      case 'manage_livestream_bot':
        return this.livestreamHandler.manageLivestreamBot(params, ctx);

      case 'execute_workflow':
        return this.workflowHandler.executeWorkflow(params, ctx);

      case 'set_workflow_schedule':
        return this.workflowHandler.setWorkflowSchedule(params, ctx);

      case 'list_workflow_runs':
        return this.workflowHandler.listWorkflowRuns(params, ctx);

      case 'get_workflow_run':
        return this.workflowHandler.getWorkflowRun(params, ctx);

      case 'get_workflow_inputs':
        return this.workflowHandler.getWorkflowInputs(params, ctx);

      case 'get_analytics':
        return this.analyticsHandler.getAnalytics(params, ctx);

      case 'get_connection_status':
        return this.connectionHandler.getConnectionStatus(params, ctx);

      case 'initiate_oauth_connect':
        return this.connectionHandler.initiateOAuthConnect(params, ctx);

      case 'get_trends':
        return this.trendsHandler.getTrends(params, ctx);

      case 'list_ads_research':
        return this.adsResearchHandler.listAdsResearch(params, ctx);

      case 'get_ad_research_detail':
        return this.adsResearchHandler.getAdResearchDetail(params, ctx);

      case 'create_ad_remix_workflow':
        return this.adsResearchHandler.createAdRemixWorkflow(params, ctx);

      case 'generate_ad_pack':
        return this.adsResearchHandler.generateAdPack(params, ctx);

      case 'prepare_ad_launch_review':
        return this.adsResearchHandler.prepareAdLaunchReview(params, ctx);

      case 'ai_action':
        return this.mediaGenerationHandler.aiAction(params, ctx);

      case 'generate_content':
        return this.mediaGenerationHandler.generateContent(params, ctx);

      case 'generate_image':
        return this.mediaGenerationHandler.generateImage(params, ctx);

      case 'reframe_image':
        return this.mediaGenerationHandler.reframeImage(params, ctx);

      case 'upscale_image':
        return this.mediaGenerationHandler.upscaleImage(params, ctx);

      case 'generate_video':
        return this.mediaGenerationHandler.generateVideo(params, ctx);

      case 'generate_music':
        return this.mediaGenerationHandler.generateMusic(params, ctx);

      case 'generate_voice':
        return this.mediaGenerationHandler.generateVoice(params, ctx);

      case 'open_studio_handoff':
        return this.workspaceHandler.openStudioHandoff(params);

      case 'generate_content_batch':
        return this.mediaGenerationHandler.generateContentBatch(params, ctx);

      case 'resolve_handle':
        return this.connectionHandler.resolveHandle(params, ctx);

      case 'list_review_queue':
        return this.reviewHandler.listReviewQueue(params, ctx);

      case 'batch_approve_reject':
        return this.reviewHandler.batchApproveReject(params, ctx);

      case 'create_outreach_sequence':
        return this.campaignHandler.createCampaign(params, ctx);

      case 'start_outreach_sequence':
        return this.campaignHandler.startCampaign(params, ctx);

      case 'pause_outreach_sequence':
        return this.campaignHandler.pauseCampaign(params, ctx);

      case 'complete_outreach_sequence':
        return this.campaignHandler.completeCampaign(params, ctx);

      case 'get_outreach_sequence_analytics':
        return this.campaignHandler.getCampaignAnalytics(params, ctx);

      case 'create_brand':
        return this.onboardingHandler.createBrand(params, ctx);

      case 'rename_brand':
        return this.onboardingHandler.renameBrand(params, ctx);

      case 'check_onboarding_status':
        return this.onboardingHandler.checkOnboardingStatus(ctx);

      case 'complete_onboarding':
        return this.onboardingHandler.completeOnboarding(ctx);

      case 'connect_social_account':
        return this.onboardingHandler.connectSocialAccount(params, ctx);

      case 'generate_onboarding_content':
        return this.onboardingHandler.generateOnboardingContent(params, ctx);

      case 'present_payment_options':
        return this.onboardingHandler.presentPaymentOptions(ctx);

      case 'generate_monthly_content':
        return this.brandContentHandler.generateMonthlyContent(params, ctx);

      case 'draft_brand_voice_profile':
        return this.brandContentHandler.draftBrandVoiceProfile(params, ctx);

      case 'save_brand_voice_profile':
        return this.brandContentHandler.saveBrandVoiceProfile(params, ctx);

      case 'discover_engagements':
        return this.proactiveHandler.discoverEngagements(params, ctx);

      case 'draft_engagement_reply':
        return this.proactiveHandler.draftEngagementReply(params, ctx);

      case 'get_approval_summary':
        return this.proactiveHandler.getApprovalSummary(ctx);

      case 'analyze_performance':
        return this.proactiveHandler.analyzePerformance(params, ctx);

      case 'get_content_calendar':
        return this.proactiveHandler.getContentCalendar(params, ctx);

      case 'update_strategy_state':
        return this.proactiveHandler.updateStrategyState(params, ctx);

      case 'generate_as_identity':
        return this.mediaGenerationHandler.generateAsIdentity(params, ctx);

      case 'render_dashboard':
        return this.dashboardHandler.renderDashboard(params, ctx);

      case 'save_dashboard_layout':
        return this.dashboardHandler.saveDashboardLayout(params, ctx);

      case 'get_dashboard_layout':
        return this.dashboardHandler.getDashboardLayout(params, ctx);

      case 'prepare_generation':
        return this.prepareHandler.prepareGeneration(params, ctx);

      case 'prepare_workflow_trigger':
        return this.prepareHandler.prepareWorkflowTrigger(params, ctx);

      case 'prepare_voice_clone':
        return this.prepareHandler.prepareVoiceClone(ctx, params);

      case 'prepare_clip_workflow_run':
        return this.prepareHandler.prepareClipWorkflowRun(params, ctx);

      case 'suggest_ingredient_alternatives':
        return this.qualityHandler.suggestIngredientAlternatives(params);

      case 'suggest_next_steps':
        return this.prepareHandler.suggestNextSteps(params);

      case 'spawn_content_agent':
        return this.spawnHandler.spawnContentAgent(params, ctx);

      case 'select_ingredient':
        return this.qualityHandler.selectIngredient(params, ctx);

      case 'request_asset':
        return this.spawnHandler.requestAsset(params, ctx);

      case 'rate_content':
        return this.qualityHandler.rateContent(params, ctx);

      case 'score_seo':
        return this.qualityHandler.scoreSeo(params, ctx);

      case 'rate_ingredient':
        return this.qualityHandler.rateIngredient(params, ctx);

      case 'get_top_ingredients':
        return this.qualityHandler.getTopIngredients(params, ctx);

      case 'replicate_top_ingredient':
        return this.qualityHandler.replicateTopIngredient(params, ctx);

      case 'capture_memory':
        return this.memoryGoalsHandler.captureMemory(params, ctx);

      case 'create_goal':
        return this.memoryGoalsHandler.createGoal(params, ctx);

      case 'check_goal_progress':
        return this.memoryGoalsHandler.checkGoalProgress(params, ctx);

      case 'update_goal':
        return this.memoryGoalsHandler.updateGoal(params, ctx);

      case 'start_brand_interview':
        return this.brandInterviewHandler.startBrandInterview(params, ctx);

      case 'submit_brand_interview_answer':
        return this.brandInterviewHandler.submitBrandInterviewAnswer(
          params,
          ctx,
        );

      case 'skip_brand_interview_question':
        return this.brandInterviewHandler.skipBrandInterviewQuestion(
          params,
          ctx,
        );

      case 'get_brand_completeness':
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
