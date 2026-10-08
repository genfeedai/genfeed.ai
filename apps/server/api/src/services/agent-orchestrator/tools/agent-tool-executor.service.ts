import { mergeRequestedSkillSlugs } from '@api/collections/skills/utils/requested-skill-slugs.util';
import { VisualProjectsService } from '@api/collections/visual-projects/services/visual-projects.service';
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
import { AGENT_CREDIT_COSTS } from '@api/services/agent-orchestrator/constants/agent-credit-costs.constant';
import type {
  AgentGenerationMode,
  AgentGenerationSettings,
} from '@api/services/agent-orchestrator/interfaces/agent-chat.interface';
import { AgentAdsResearchToolHandler } from '@api/services/agent-orchestrator/tools/agent-ads-research-tool-handler.service';
import { AgentAnalyticsToolHandler } from '@api/services/agent-orchestrator/tools/agent-analytics-tool-handler.service';
import { AgentBrandContentToolHandler } from '@api/services/agent-orchestrator/tools/agent-brand-content-tool-handler.service';
import { AgentBrandContextToolHandler } from '@api/services/agent-orchestrator/tools/agent-brand-context-tool-handler.service';
import { AgentBrandInterviewToolHandler } from '@api/services/agent-orchestrator/tools/agent-brand-interview-tool-handler.service';
import { AgentCampaignToolHandler } from '@api/services/agent-orchestrator/tools/agent-campaign-tool-handler.service';
import { AgentConnectionToolHandler } from '@api/services/agent-orchestrator/tools/agent-connection-tool-handler.service';
import { AgentDashboardToolHandler } from '@api/services/agent-orchestrator/tools/agent-dashboard-tool-handler.service';
import { AgentGenerationOptionsToolHandler } from '@api/services/agent-orchestrator/tools/agent-generation-options-tool-handler.service';
import { AgentGenerationSettingsToolHandler } from '@api/services/agent-orchestrator/tools/agent-generation-settings-tool-handler.service';
import { AgentInstagramInspirationToolHandler } from '@api/services/agent-orchestrator/tools/agent-instagram-inspiration-tool-handler.service';
import { AgentKnowledgeToolHandler } from '@api/services/agent-orchestrator/tools/agent-knowledge-tool-handler.service';
import { AgentLivestreamToolHandler } from '@api/services/agent-orchestrator/tools/agent-livestream-tool-handler.service';
import { AgentMediaGenerationToolHandler } from '@api/services/agent-orchestrator/tools/agent-media-generation-tool-handler.service';
import { AgentMemoryGoalsToolHandler } from '@api/services/agent-orchestrator/tools/agent-memory-goals-tool-handler.service';
import { AgentOnboardingBrandSetupToolHandler } from '@api/services/agent-orchestrator/tools/agent-onboarding-brand-setup-tool-handler.service';
import { AgentOnboardingToolHandler } from '@api/services/agent-orchestrator/tools/agent-onboarding-tool-handler.service';
import { AgentPrepareToolHandler } from '@api/services/agent-orchestrator/tools/agent-prepare-tool-handler.service';
import { AgentProactiveToolHandler } from '@api/services/agent-orchestrator/tools/agent-proactive-tool-handler.service';
import { AgentPublishToolHandler } from '@api/services/agent-orchestrator/tools/agent-publish-tool-handler.service';
import { AgentQualityToolHandler } from '@api/services/agent-orchestrator/tools/agent-quality-tool-handler.service';
import { AgentReviewToolHandler } from '@api/services/agent-orchestrator/tools/agent-review-tool-handler.service';
import { AgentRouteRewriteService } from '@api/services/agent-orchestrator/tools/agent-route-rewrite.service';
import { AgentSpawnToolHandler } from '@api/services/agent-orchestrator/tools/agent-spawn-tool-handler.service';
import { AgentToolCatalogHandler } from '@api/services/agent-orchestrator/tools/agent-tool-catalog-handler.service';
import { dispatchRegisteredAgentTool } from '@api/services/agent-orchestrator/tools/agent-tool-dispatch.routes';
import { AgentToolMutationAuthorizationService } from '@api/services/agent-orchestrator/tools/agent-tool-mutation-authorization.service';
import { readOptionalString } from '@api/services/agent-orchestrator/tools/agent-tool-parameter-readers';
import {
  AGENT_TOOL_WORKFLOW_DEFINITIONS,
  findAgentToolWorkflowDefinition,
} from '@api/services/agent-orchestrator/tools/agent-tool-workflow-definition';
import { AgentTransferToolHandler } from '@api/services/agent-orchestrator/tools/agent-transfer-tool-handler.service';
import { AgentTrendsToolHandler } from '@api/services/agent-orchestrator/tools/agent-trends-tool-handler.service';
import { AgentWorkObjectService } from '@api/services/agent-orchestrator/tools/agent-work-object.service';
import { AgentWorkflowToolHandler } from '@api/services/agent-orchestrator/tools/agent-workflow-tool-handler.service';
import { AgentWorkspaceToolHandler } from '@api/services/agent-orchestrator/tools/agent-workspace-tool-handler.service';
import { AgentXActionsToolHandler } from '@api/services/agent-orchestrator/tools/agent-x-actions-tool-handler.service';
import {
  assertKnowledgeWorkflowScopeParameters,
  assertKnowledgeWorkflowSuccess,
  attachKnowledgeWorkflowProvenance,
  isKnowledgeWorkflowAction,
  shouldUseKnowledgeWorkflowEntry,
  toWorkflowToolExecutionContext,
} from '@api/services/agent-orchestrator/tools/knowledge-workflow-execution.util';
import type {
  AgentThreadModeValue,
  CuratedActionName,
} from '@genfeedai/actions';
import {
  getMediaTransformOperation,
  getToolByName,
  getToolsForSurface,
  getVisualMediaGenerationType,
  VISUAL_CODE_ACTION_ALIASES,
} from '@genfeedai/actions';
import {
  ActionOrigin,
  type RouterPriority,
  WorkflowExecutionTrigger,
} from '@genfeedai/contracts';
import type {
  AgentToolResult,
  KnowledgeSelection,
  ValidatedAgentScope,
} from '@genfeedai/contracts/interfaces';

import { LoggerService } from '@libs/logger/logger.service';
import {
  Inject,
  Injectable,
  type OnModuleInit,
  Optional,
} from '@nestjs/common';
import { toPlainJson } from '@serializers/helpers/plain-json.helper';

const UNQUOTED_PAID_AGENT_TOOLS = new Set<string>([
  'generate',
  'generate_as_identity',
  'transform_media',
  'generate_onboarding_content',
  'generate_ad_pack',
  'enhance_prompt',
  'execute_workflow',
]);

export function agentToolCreditEstimate(
  toolName: string,
  parameters: Record<string, unknown>,
): number | undefined {
  // Batch preparation enforces its authoritative quote against the remaining cap before reserving credits.
  if (toolName === 'generate_content_batch') return 0;
  // Merging clips runs on the local files queue and is never charged.
  if (getMediaTransformOperation(toolName, parameters) === 'merge') return 0;
  if (UNQUOTED_PAID_AGENT_TOOLS.has(toolName)) return undefined;
  if (
    toolName === 'generate_content' &&
    (parameters.longForm === true ||
      ['article', 'x-article'].includes(
        String(parameters.type ?? parameters.contentType ?? '')
          .trim()
          .toLowerCase(),
      ))
  )
    return undefined;
  return AGENT_CREDIT_COSTS[toolName];
}

export interface ToolExecutionContext {
  isProactive?: boolean;
  /** Transient constraint issued by mutation authorization; stripped from incoming contexts. */
  proactiveTextDraftOnly?: true;
  creditBudget?: number;
  apiKeyContext?: ApiKeyPublishingContext;
  /** URLs of user-attached images from the chat message */
  attachmentUrls?: string[];
  userId: string;
  organizationId: string;
  threadId?: string;
  /**
   * #4672 per-thread agent mode ('auto' | 'manual' | 'plan'). When omitted,
   * `AgentToolMutationAuthorizationService.authorize` resolves it from the
   * thread record; a threadless execution (CLI, recurring task, batch) falls
   * back to Manual — the fail-safe, always-confirming default.
   */
  agentMode?: AgentThreadModeValue;
  /** Router request vocabulary — map the persisted setting with `toRouterPriority`. */
  generationPriority?: RouterPriority;
  generationMode?: AgentGenerationMode;
  generationSettings?: AgentGenerationSettings;
  /** Explicit Knowledge selection chosen for this turn. */
  knowledgeSelection?: KnowledgeSelection;
  requestedSkillSlugs?: string[];
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
  /** Internal Knowledge workflow entry: exclude personal rows. Never from HTTP. */
  isWorkflowScoped?: boolean;
  /** BullMQ scheduled-fire job id, used as the Knowledge refresh tick key. */
  scheduledFireJobId?: string;
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
   * An unspecified host cannot authorize mutations.
   */
  hostSupportsApproval?: boolean;
  /** Already-claimed MCP/tool approval that authorizes this exact logical write. */
  approvedApprovalId?: string;
  /** Server-derived reviewer authority, restricted to threadless approval redemption. */
  approvalReviewerAuthorized?: boolean;
}

const BRANDLESS_AGENT_TOOLS = new Set<CuratedActionName>([
  'get_generation_options',
  'set_generation_settings',
  'analyze_performance',
  'check_goal_progress',
  'check_onboarding_status',
  'connect_social_account',
  'create_brand',
  'create_brand_from_url',
  'get_brand_scan_status',
  'get_ad_research_detail',
  'get_analytics',
  'get_approval_summary',
  'get_connection_status',
  'get_account',
  'get_dashboard_layout',
  'get_top_ingredients',
  'get_trends',
  'get_workflow_inputs',
  'get_workflow_run',
  'inspect_workflow',
  'list_ads_research',
  'list_agent_conversations',
  'get_brands',
  'get_posts',
  'list_assets',
  'list_genfeed_tools',
  'list_outlier_posts',
  'request_media_upload',
  'complete_media_upload',
  'list_review_queue',
  'list_system_workflow_catalog',
  'list_workflow_runs',
  'list_workflows',
  'present_payment_options',
  'render_dashboard',
  'request_input',
  'present_work_object',
  'ingest_source_media',
  'initiate_oauth_connect',
  'resolve_handle',
  'suggest_next_steps',
  'transfer_agent_conversation',
]);

/**
 * Whether a call needs an explicit thread brand. Image and video generation
 * resolve a brand themselves; voice and music need one. Merging clips is
 * brand-agnostic: the clips are scoped by organization.
 */
function isBrandRequiredTool(
  toolName: CuratedActionName,
  parameters: Record<string, unknown>,
): boolean {
  return (
    !BRANDLESS_AGENT_TOOLS.has(toolName) &&
    !getVisualMediaGenerationType(toolName, parameters) &&
    getMediaTransformOperation(toolName, parameters) !== 'merge'
  );
}

/**
 * Thin agent tool router. Tool families live in dedicated handlers (#519).
 */
@Injectable()
export class AgentToolExecutorService implements OnModuleInit {
  private readonly constructorName = String(this.constructor.name);

  @Inject(VisualProjectsService)
  private readonly visualProjects!: VisualProjectsService;

  @Inject(AgentWorkObjectService)
  private readonly workObjects!: AgentWorkObjectService;

  @Inject(AgentGenerationOptionsToolHandler)
  private readonly generationOptionsHandler!: AgentGenerationOptionsToolHandler;

  @Inject(AgentGenerationSettingsToolHandler)
  private readonly generationSettingsHandler!: AgentGenerationSettingsToolHandler;

  @Inject(AgentBrandContextToolHandler)
  private readonly brandContextHandler!: AgentBrandContextToolHandler;

  @Inject(AgentOnboardingBrandSetupToolHandler)
  private readonly onboardingBrandSetupHandler!: AgentOnboardingBrandSetupToolHandler;

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
    private readonly knowledgeHandler: AgentKnowledgeToolHandler,
    private readonly mutationAuthorizationService: AgentToolMutationAuthorizationService,
    @Optional()
    private readonly agentScopeContextService?: AgentScopeContextService,
    @Optional()
    private readonly transferHandler?: AgentTransferToolHandler,
    @Optional()
    private readonly systemWorkflowRunner?: SystemWorkflowRunnerService,
  ) {}

  onModuleInit(): void {
    const runner = this.requireWorkflowRunner();
    for (const toolName of getToolsForSurface('agent').map(
      (tool) => tool.name,
    )) {
      if (Object.hasOwn(VISUAL_CODE_ACTION_ALIASES, toolName)) continue;
      const definition = getToolByName(toolName);
      if (
        !definition ||
        (!definition.surfaces.agent && !definition.surfaces.mcp)
      ) {
        continue;
      }
      runner.registerAction(
        toolName,
        async ({
          context: workflowContext,
          input,
          provenance,
          runtimeContext,
        }) => {
          const liveContext =
            runtimeContext &&
            typeof runtimeContext === 'object' &&
            !Array.isArray(runtimeContext)
              ? (runtimeContext as ToolExecutionContext)
              : undefined;
          const useKnowledgeWorkflowEntry = shouldUseKnowledgeWorkflowEntry({
            hasAgentRuntimeContext: Boolean(liveContext),
            isCustomerWorkflow: workflowContext.isCustomerWorkflow,
          });

          if (useKnowledgeWorkflowEntry) {
            if (!isKnowledgeWorkflowAction(toolName)) {
              throw new Error(
                `Agent tool ${toolName} requires its authenticated runtime context`,
              );
            }
            assertKnowledgeWorkflowScopeParameters(input, workflowContext);
            const scopedContext =
              toWorkflowToolExecutionContext(workflowContext);
            const result = await this.executeToolWithActionOrigin(
              toolName,
              input,
              scopedContext,
            );
            const nodeId = provenance.nodeId;
            if (!nodeId) {
              throw new Error('Knowledge workflow nodes require a node id');
            }
            return assertKnowledgeWorkflowSuccess(
              attachKnowledgeWorkflowProvenance(
                result,
                workflowContext,
                nodeId,
              ),
              toolName,
            );
          }

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
    if (
      getVisualMediaGenerationType(toolName, parameters) ||
      ['enhance_prompt', 'prepare_generation'].includes(toolName)
    ) {
      const requestedSkillSlugs = mergeRequestedSkillSlugs(
        context.requestedSkillSlugs,
        parameters.requestedSkillSlugs,
      );
      parameters = { ...parameters };
      if (requestedSkillSlugs)
        parameters.requestedSkillSlugs = requestedSkillSlugs;
      else delete parameters.requestedSkillSlugs;
    }
    if (context.creditBudget !== undefined) {
      const estimate = agentToolCreditEstimate(toolName, parameters);
      if (
        !Number.isFinite(context.creditBudget) ||
        context.creditBudget <= 0 ||
        estimate === undefined ||
        !Number.isFinite(estimate) ||
        estimate < 0 ||
        estimate > context.creditBudget
      ) {
        return {
          success: false,
          creditsUsed: 0,
          error:
            'Agent credit budget exhausted or paid-operation quote unavailable',
        };
      }
    }
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
    context = { ...context };
    delete context.proactiveTextDraftOnly;
    const startTime = Date.now();
    let executionApprovalId: string | undefined;
    let executionResult: AgentToolResult;
    let executionFailed = false;
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
      }

      await this.assertToolBrandScope(toolName, parameters, context);
      await this.workObjects.assertReady(context, toolName);
      const policyResult = await this.mutationAuthorizationService.authorize(
        toolName,
        parameters,
        context,
        {
          dispatchPreview: (previewToolName, previewParams, previewContext) =>
            this.dispatchRegisteredTool(
              previewToolName,
              previewParams,
              previewContext,
            ),
          prepareHandler: this.prepareHandler,
          publishHandler: this.publishHandler,
          routeRewriteService: this.routeRewriteService,
        },
      );
      if (policyResult.kind === 'return') {
        return toPlainJson(policyResult.result);
      }
      executionApprovalId = policyResult.approvalId;
      if (policyResult.executeAsUserId) {
        context = { ...context, userId: policyResult.executeAsUserId };
      }
      if (policyResult.constraint) {
        if (toolName !== 'create_post') {
          throw new Error(
            'Draft-only authorization is limited to create_post.',
          );
        }
        context = { ...context, proactiveTextDraftOnly: true };
      }

      const result = this.instagramInspirationHandler.handles(toolName)
        ? await this.instagramInspirationHandler.execute(
            toolName,
            parameters,
            context,
          )
        : this.xActionsHandler.handles(toolName)
          ? await this.xActionsHandler.execute(toolName, parameters, context)
          : [
                'request_input',
                'present_work_object',
                'ingest_source_media',
              ].includes(toolName)
            ? await this.workObjects.execute(toolName, parameters, context)
            : this.generationSettingsHandler.handles(toolName)
              ? await this.generationSettingsHandler.execute(
                  toolName,
                  parameters,
                  context,
                )
              : await this.dispatchRegisteredTool(
                  toolName,
                  parameters,
                  context,
                );
      const scopedResult = await this.routeRewriteService.scopeToolResultHrefs(
        result,
        context,
      );
      executionResult = scopedResult;
    } catch (error: unknown) {
      executionFailed = true;
      const durationMs = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      this.loggerService.error(
        `Tool ${toolName} failed after ${durationMs}ms: ${errorMessage}`,
        this.constructorName,
      );

      executionResult = { creditsUsed: 0, error: errorMessage, success: false };
    }

    // Persist outside the execution catch: a storage failure must never replace
    // a completed action's outcome with a tool failure.
    await this.mutationAuthorizationService.recordApprovedMutationResult(
      executionApprovalId,
      context.organizationId,
      executionResult,
    );
    if (!executionFailed) {
      this.loggerService.log(
        `Tool ${toolName} executed in ${Date.now() - startTime}ms`,
        this.constructorName,
      );
    }
    return toPlainJson(executionResult);
  }

  private async assertToolBrandScope(
    toolName: CuratedActionName,
    parameters: Record<string, unknown>,
    context: ToolExecutionContext,
  ): Promise<void> {
    const actor = {
      userId: context.userId,
      organizationId: context.organizationId,
      ...context.apiKeyContext,
    };
    const parameterBrandId = readOptionalString(parameters.brandId);
    for (const brandId of new Set(
      [context.brandId, parameterBrandId].filter((id): id is string =>
        Boolean(id),
      ),
    )) {
      await this.agentScopeContextService.assertBrandAuthorized(brandId, actor);
    }
    const scope = context.validatedScope;
    if (!scope) return;

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

    if (!scope.brandId && isBrandRequiredTool(toolName, parameters)) {
      throw new Error(
        `An explicit thread brand context is required for ${toolName}.`,
      );
    }
  }

  private dispatchRegisteredTool(
    toolName: CuratedActionName,
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    if (toolName === 'get_generation_options') {
      return this.dispatchGenerationOptions(toolName, params, ctx);
    }
    return Object.hasOwn(VISUAL_CODE_ACTION_ALIASES, toolName)
      ? this.dispatchVisualCode(toolName, params, ctx)
      : this.dispatch(toolName, params, ctx);
  }

  private dispatchGenerationOptions(
    toolName: CuratedActionName,
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    switch (toolName) {
      case 'get_generation_options':
        return this.generationOptionsHandler.execute(params, ctx);
      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }

  private async dispatchVisualCode(
    toolName: CuratedActionName,
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    switch (toolName) {
      case 'get_visual_code_catalog':
      case 'quote_visual_code_generation':
      case 'generate_visual_code':
      case 'get_visual_code_project':
      case 'revise_visual_code_project':
      case 'export_visual_code_project':
      case 'cancel_visual_code_project':
      case 'retry_visual_code_project':
        return this.visualProjects.executeAgentAction(toolName, params, ctx);

      default:
        throw new Error('Unsupported visual-code action');
    }
  }

  private async dispatch(
    toolName: CuratedActionName,
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    return dispatchRegisteredAgentTool(
      {
        adsResearchHandler: this.adsResearchHandler,
        analyticsHandler: this.analyticsHandler,
        brandContentHandler: this.brandContentHandler,
        brandContextHandler: this.brandContextHandler,
        brandInterviewHandler: this.brandInterviewHandler,
        campaignHandler: this.campaignHandler,
        catalogHandler: this.catalogHandler,
        connectionHandler: this.connectionHandler,
        dashboardHandler: this.dashboardHandler,
        knowledgeHandler: this.knowledgeHandler,
        livestreamHandler: this.livestreamHandler,
        mediaGenerationHandler: this.mediaGenerationHandler,
        memoryGoalsHandler: this.memoryGoalsHandler,
        onboardingBrandSetupHandler: this.onboardingBrandSetupHandler,
        onboardingHandler: this.onboardingHandler,
        prepareHandler: this.prepareHandler,
        proactiveHandler: this.proactiveHandler,
        publishHandler: this.publishHandler,
        qualityHandler: this.qualityHandler,
        reviewHandler: this.reviewHandler,
        spawnHandler: this.spawnHandler,
        transferHandler: this.transferHandler,
        trendsHandler: this.trendsHandler,
        workflowHandler: this.workflowHandler,
        workspaceHandler: this.workspaceHandler,
      },
      toolName,
      params,
      ctx,
    );
  }
}
