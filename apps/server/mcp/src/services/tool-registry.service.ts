import {
  getToolByName,
  getToolsForSurface,
  isMcpBrandRequiredTool,
  isMcpBrandRequiredWhenMultipleTool,
  isToolAllowedInMcpAccessMode,
  type McpAccessMode,
  type McpToolOutput,
  readMcpBrandId,
  toMcpTools,
} from '@genfeedai/actions';
import { formatAgentError } from '@genfeedai/agent/server';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import {
  type AgentToolResult,
  type IScheduledReleaseBatchItemError,
} from '@genfeedai/contracts/interfaces';
import { serializeMediaArtifact } from '@genfeedai/helpers';
import { SATOSHI_FONT_RESOURCE_PATH } from '@genfeedai/ui/static/font';
import { isRecord } from '@genfeedai/utils/data/extract.util';
import { readKnowledgeSearchReceipts } from '@genfeedai/utils/knowledge/knowledge-receipt.util';
import { LoggerService } from '@libs/logger/logger.service';
import { ConfigService } from '@mcp/config/config.service';
import { McpAuthGuard } from '@mcp/guards/mcp-auth.guard';
import {
  MCP_RESOURCES,
  McpResourceUri,
  PUBLIC_MCP_RESOURCES,
} from '@mcp/mcp/resource-catalog';
import { getPublicAppUrl, getPublicMcpUrl } from '@mcp/mcp/setup-page';
import {
  isAdsGatewayTool,
  isGoogleAdsTool,
  isMetaAdsTool,
  isTikTokAdsTool,
} from '@mcp/services/ads-tool-names.util';
import { AuthService, type McpRole } from '@mcp/services/auth.service';
import { ClientService } from '@mcp/services/client.service';
import { withAccountOrganizations } from '@mcp/services/mcp-account-organizations.util';
import {
  pendingApprovalResult,
  readCardApprovalAnswer,
  settleApprovalAnswer,
} from '@mcp/services/mcp-approval-answer.util';
import {
  isMcpApprovalRedeemable,
  requiresMcpAgentConfirmation,
  requiresMcpToolApproval,
} from '@mcp/services/mcp-approval-gate.util';
import {
  isBrandContextUri,
  readBrandContextResource,
} from '@mcp/services/mcp-brand-context-resource.util';
import { nameBrands } from '@mcp/services/mcp-brand-named-result.util';
import {
  brandChoiceToolResult,
  brandRequiredToolResult,
} from '@mcp/services/mcp-brand-required-result.util';
import { listCallerBrands } from '@mcp/services/mcp-caller-brands.util';
import type { CardApprovalProofs } from '@mcp/services/mcp-card-approval-proof.util';
import {
  resolveAuthorizedMcpCatalogCall,
  validateMcpCatalogDispatchCoverage,
} from '@mcp/services/mcp-catalog-call.util';
import { unavailableInConnectorMessage } from '@mcp/services/mcp-connector-message.util';
import { toNativeMcpMediaResult } from '@mcp/services/mcp-media-result.util';
import { runInNamedOrganization } from '@mcp/services/mcp-organization-call.util';
import { describeToolArguments } from '@mcp/services/mcp-request-event.util';
import {
  agentGuideResource,
  jsonResource,
  markdownResource,
} from '@mcp/services/mcp-resource-contents.util';
import {
  batchPendingFor,
  prepareToolBatch,
  settledBatchText,
  withOmittedReleases,
} from '@mcp/services/mcp-scheduled-batch.util';
import { finalizeMcpToolResult } from '@mcp/services/mcp-tool-result.util';
import {
  ACCOUNT_MANAGEMENT_TOOL_NAMES,
  AGENT_CHAT_TOOL_NAMES,
  AGENT_EXECUTOR_TOOL_NAMES,
  type ExecutorKind,
  PRE_DISPATCH_TOOL_NAMES,
  WORKFLOW_CONTROL_TOOL_NAMES,
} from '@mcp/services/tool-executor-kinds';
import type {
  McpApprovalAnswer,
  McpApprovalResource,
} from '@mcp/shared/interfaces/approval.interface';
import type { McpResource } from '@mcp/shared/interfaces/mcp-resource.interface';
import {
  accountToolText,
  dataToolResult,
} from '@mcp/shared/utils/tool-result-text.util';
import { handleAccountManagementTool } from '@mcp/tools/account-management.tool';
import { handleAdsGatewayTool } from '@mcp/tools/ads-gateway.tool';
import { handleAgentChatTool } from '@mcp/tools/agent-chat.tool';
import {
  ANALYTICS_TOOL_NAMES,
  handleAnalyticsTool,
} from '@mcp/tools/analytics.tool';
import { handleBrandKitTool } from '@mcp/tools/brand-kit.tool';
import {
  CLIPPER_PROJECTS_TOOL_NAMES,
  handleClipperProjectsTool,
} from '@mcp/tools/clipper-projects.tool';
import { CONTENT_TOOL_NAMES, handleContentTool } from '@mcp/tools/content.tool';
import { EDITOR_TOOL_NAMES, handleEditorTool } from '@mcp/tools/editor.tool';
import { handleGoogleAdsTool } from '@mcp/tools/google-ads.tool';
import {
  confirmationRequiredToolResult,
  isMcpToolRefusal,
  McpUpstreamError,
  mcpToolErrorResult,
  toMcpToolErrorResult,
} from '@mcp/tools/mcp-tool-error';
import { handleMetaAdsTool } from '@mcp/tools/meta-ads.tool';
import {
  handleModels3dTool,
  MODELS3D_TOOL_NAMES,
} from '@mcp/tools/models3d.tool';
import {
  ONBOARDING_TOOL_NAMES,
  resolveOnboardBrandCall,
} from '@mcp/tools/onboarding.tool';
import { handlePresetTool, PRESET_TOOL_NAMES } from '@mcp/tools/presets.tool';
import { handleRemixTool, REMIX_TOOL_NAMES } from '@mcp/tools/remix.tool';
import { mcpToolFailureResult } from '@mcp/tools/requested-organization.util';
import {
  handleSchedulerTool,
  SCHEDULER_TOOL_NAMES,
} from '@mcp/tools/scheduler.tool';
import {
  handleSkillsProTool,
  SKILLS_PRO_TOOL_NAMES,
} from '@mcp/tools/skills-pro.tool';
import {
  handleSocialMessagesTool,
  SOCIAL_MESSAGES_TOOL_NAMES,
} from '@mcp/tools/social-messages.tool';
import {
  handleStoryboardTool,
  STORYBOARD_TOOL_NAMES,
} from '@mcp/tools/storyboard.tool';
import { handleTikTokAdsTool } from '@mcp/tools/tiktok-ads.tool';
import {
  handleToolDiscoveryTool,
  TOOL_DISCOVERY_TOOL_NAMES,
} from '@mcp/tools/tool-discovery.tool';
import { handleWorkflowControlTool } from '@mcp/tools/workflow-control.tool';
import {
  handleWorkflowStatusTool,
  WORKFLOW_STATUS_TOOL_NAMES,
} from '@mcp/tools/workflow-status.tool';
import {
  handleWorkspaceAppTool,
  WORKSPACE_APP_TOOL_NAMES,
} from '@mcp/tools/workspace-app.tool';
import { cardResource } from '@mcp/ui/card-app';
import { CARD_APPROVAL_PROOF_META_KEY } from '@mcp/ui/card-approval-proof';
import {
  isContentCardsUri,
  MCP_CARD_RESOURCE_HASH,
  withApprovalCard,
  withCardMetadata,
} from '@mcp/ui/card-data';
import { withoutBrandLogos } from '@mcp/ui/card-fields';
import { Injectable, type OnModuleInit, Optional } from '@nestjs/common';

interface ToolCallParams {
  name: string;
  arguments: Record<string, unknown>;
  /** The requester's answer to this call's approval prompt (#9647). */
  approvalAnswer?: McpApprovalAnswer;
}

interface ResourceReadParams {
  uri: string;
}

@Injectable()
export class ToolRegistryService implements OnModuleInit {
  /**
   * Boot-time drift guard. The DI singleton (registered in `McpGenfeedAiModule`)
   * runs this once at startup; a failure crashes boot so the `/v1/health` check
   * stays red and the deploy is blocked — far better than shipping a tool the
   * server advertises but cannot execute. Per-request `new ToolRegistryService`
   * instances do not trigger this (no Nest lifecycle), so there is no per-call
   * cost.
   */
  onModuleInit(): void {
    ToolRegistryService.validateDispatchCoverage();
  }

  /**
   * Assert the canonical registry and this service cannot silently drift:
   * (1) every MCP-surfaced tool classifies to a real executor, and
   * (2) every MCP-surfaced approval-required tool still classifies (a stale
   * catalog policy must not advertise a write the server cannot resume).
   */
  static validateDispatchCoverage(): void {
    validateMcpCatalogDispatchCoverage(
      (name) => ToolRegistryService.classify(name),
      PRE_DISPATCH_TOOL_NAMES,
    );
  }

  constructor(
    private readonly clientService: ClientService,
    private readonly logger: LoggerService,
    // Per-request callers (`StreamableHttpService.buildServer`) pass the
    // authenticated caller's role via `new ToolRegistryService(...)`. When
    // resolved as a DI singleton (`McpController`'s REST mirror), there is no
    // per-request role, so it falls back to `'user'` — deny-by-default for
    // admin tools.
    @Optional() private readonly requestRole: McpRole = 'user',
    @Optional() private readonly configService?: ConfigService,
    @Optional() private readonly requestAccessMode: McpAccessMode = 'standard',
    // Whether the connection may act in all of the user's organizations, from
    // the identity check. Only then does a call have to name its organization.
    @Optional()
    private readonly requestCanSwitchOrganizations: boolean = false,
    // Proofs that a click came from the approval card (#9754); absent where
    // there is no card or no member to bind them to.
    @Optional() private readonly cardApprovalProofs?: CardApprovalProofs,
  ) {}

  /**
   * Every MCP-surfaced tool, unfiltered. Prefer {@link getToolsForRole} for
   * anything a client sees — an unfiltered list advertises tools the caller
   * cannot invoke.
   */
  getAllTools(): McpToolOutput[] {
    return toMcpTools(getToolsForSurface('mcp'))
      .filter((tool) =>
        isToolAllowedInMcpAccessMode(this.requestAccessMode, tool.name),
      )
      .map(withCardMetadata);
  }

  /**
   * Tools the given role is allowed to invoke. This is a UX/least-surprise
   * filter for `tools/list` (and the REST mirror) — the authoritative gate is
   * the per-call {@link McpAuthGuard.checkToolRole} in {@link handleToolCall}
   * and, ultimately, the API's own role guards.
   */
  static filterToolsByRole(
    tools: McpToolOutput[],
    role: McpRole,
  ): McpToolOutput[] {
    return tools.filter(
      (tool) =>
        !tool.requiredRole ||
        AuthService.hasRequiredRole(role, tool.requiredRole),
    );
  }

  /**
   * Every tool a role may invoke on an endpoint. Every connection lists the
   * whole catalog, so this is what `tools/list` and the REST mirror advertise.
   * `handleToolCall` still gates each call by role.
   */
  getToolsForRole(
    role: McpRole,
    accessMode: McpAccessMode = this.requestAccessMode,
  ): McpToolOutput[] {
    return ToolRegistryService.filterToolsByRole(
      toMcpTools(getToolsForSurface('mcp'))
        .filter((tool) => isToolAllowedInMcpAccessMode(accessMode, tool.name))
        .map(withCardMetadata),
      role,
    );
  }

  /** The tools this connection lists. */
  getTools(): McpToolOutput[] {
    return this.getToolsForRole(this.requestRole);
  }

  getResources(): McpResource[] {
    return [...MCP_RESOURCES];
  }

  getPublicResources(): McpResource[] {
    return [...PUBLIC_MCP_RESOURCES];
  }

  /**
   * A call names its organization (see requested-organization.util). On a
   * connection that covers several organizations a call that names none is
   * refused with the list, never answered from a default.
   */
  handleToolCall(params: ToolCallParams) {
    return runInNamedOrganization(
      {
        canSwitchOrganizations: this.requestCanSwitchOrganizations,
        client: this.clientService,
        logger: this.logger,
      },
      params,
      (args) => this.runToolCall({ ...params, arguments: args }),
    );
  }

  private async runToolCall(params: ToolCallParams) {
    const requestedArgs = params.arguments ?? {};
    // Creating a brand from a URL is admin work that runs an agent tool, so it
    // is routed before the merged tool is resolved.
    const onboardInput =
      params.name === 'setup_brand' && requestedArgs.action === 'onboard'
        ? requestedArgs.input
        : undefined;
    const brandCreation =
      typeof onboardInput === 'object' &&
      onboardInput !== null &&
      !Array.isArray(onboardInput) &&
      (onboardInput as Record<string, unknown>).action === 'create_from_url'
        ? resolveOnboardBrandCall(onboardInput as Record<string, unknown>)
        : null;
    let name = brandCreation?.agentToolName ?? params.name;
    let args = brandCreation?.parameters ?? requestedArgs;

    this.logger.debug(
      `Handling tool call: ${name}`,
      describeToolArguments(args),
    );

    try {
      if (!isToolAllowedInMcpAccessMode(this.requestAccessMode, name)) {
        return mcpToolErrorResult({
          code: 'unavailable_in_connector',
          message: unavailableInConnectorMessage(this.requestAccessMode, name),
        });
      }
      const canonicalTool = getToolByName(name);
      if (!canonicalTool?.surfaces.mcp) {
        throw new Error(`Unknown tool: ${name}`);
      }

      if (canonicalTool.requiredRole) {
        McpAuthGuard.checkToolRole(
          this.requestRole,
          canonicalTool.requiredRole,
        );
      }

      const catalogCall = resolveAuthorizedMcpCatalogCall(
        name,
        args,
        this.requestRole,
        this.requestAccessMode,
      );
      if (catalogCall) {
        name = catalogCall.executionName;
        args = catalogCall.arguments;
      }

      // The resolver runs the deferred action; it must not be gated as a write.
      if (name === 'resolve_approval') {
        return await this.handleResolveApproval(args ?? {});
      }
      if (name === 'answer_approval') {
        return await this.handleAnswerApproval(args ?? {});
      }

      // Rejected before any approval or charge: a generation always names its brand.
      if (isMcpBrandRequiredTool(name) && !readMcpBrandId(args)) {
        return brandRequiredToolResult(
          await listCallerBrands(this.clientService),
        );
      }

      // A draft names its brand when the organization has several. A single
      // brand is bound into the arguments here, so a queued approval and its
      // later redemption carry the same arguments (#10071).
      if (isMcpBrandRequiredWhenMultipleTool(name) && !readMcpBrandId(args)) {
        const brands = await listCallerBrands(this.clientService);
        if (brands && brands.length > 1) {
          return brandChoiceToolResult(brands);
        }
        if (brands?.length === 1) {
          args = { ...args, brandId: brands[0].id };
        }
      }

      // The requester answered this call's approval prompt (#9647). Settle it
      // against that approval before the current policy, so a decline holds.
      if (params.approvalAnswer) {
        return await this.answerApproval(params.approvalAnswer, name, args);
      }

      // Declared approvals and credit spenders wait for confirmation, unless the
      // organization and member both waived a credit spender (mcp-approval-gate.util).
      // A release batch is validated whole first; refused releases are named (#10134).
      const prepared = await prepareToolBatch(this.clientService, name, args);
      if (prepared.kind === 'rejected') return prepared.result;
      args = prepared.args;

      // Publishing is confirmed with the person in the conversation, never queued on
      // the web: without `confirmed: true` nothing runs and the agent is told to ask.
      if (requiresMcpAgentConfirmation(name, args)) {
        if (args?.confirmed !== true) {
          return confirmationRequiredToolResult(name, prepared.invalid);
        }
        const { confirmed: _confirmed, ...confirmedArgs } = args;
        args = confirmedArgs;
      }

      if (await requiresMcpToolApproval(this.clientService, name, args)) {
        const approval = await this.clientService.createApproval(
          name,
          args ?? {},
        );
        const settled = settledBatchText(approval);
        if (settled) return this.textResult(settled);
        // A reviewer approved this exact call in the Genfeed review inbox
        // (#7340); repeating it runs the approved action once.
        if (approval.status === 'APPROVED' && !approval.result) {
          return await this.runApprovedApproval(approval);
        }
        return this.pendingResult(approval, args ?? {}, prepared.invalid);
      }

      const done = await this.executeTool(name, args ?? {});
      return withOmittedReleases(done, prepared.invalid);
    } catch (error: unknown) {
      // A failure the classifier names (publishing held, rate limited, bad
      // input) or the API refused with a 4xx is a handled refusal the caller
      // is told about, not a fault.
      if (isMcpToolRefusal(error)) {
        this.logger.warn(`Tool call ${name} was refused:`, error);
      } else if (error instanceof McpUpstreamError && error.report) {
        // The API client already reported this failure as the fault. Log the
        // tool-level outcome under the same id so the two read as one failure.
        this.logger.warn(`Tool call ${name} failed upstream:`, {
          ...error.report,
          status: error.status,
        });
      } else {
        this.logger.error(`Error handling tool call ${name}:`, error);
      }
      return mcpToolFailureResult(error);
    }
  }

  static classify(name: string): ExecutorKind {
    if (TOOL_DISCOVERY_TOOL_NAMES.has(name)) return 'tool-discovery';
    if (AGENT_CHAT_TOOL_NAMES.has(name)) return 'agent-chat';
    if (WORKFLOW_CONTROL_TOOL_NAMES.has(name)) return 'workflow-control';
    if (WORKSPACE_APP_TOOL_NAMES.has(name)) return 'workspace-app';
    if (name === 'manage_brand_kit') return 'brand-kit';
    if (AGENT_EXECUTOR_TOOL_NAMES.has(name)) return 'agent-executor';
    if (ONBOARDING_TOOL_NAMES.has(name)) return 'onboarding';
    if (CONTENT_TOOL_NAMES.has(name)) return 'content';
    if (ANALYTICS_TOOL_NAMES.has(name)) return 'analytics';
    if (WORKFLOW_STATUS_TOOL_NAMES.has(name)) return 'workflow-status';
    if (isMetaAdsTool(name)) return 'meta-ads';
    if (isGoogleAdsTool(name)) return 'google-ads';
    if (isTikTokAdsTool(name)) return 'tiktok-ads';
    if (isAdsGatewayTool(name)) return 'ads-gateway';
    if (ACCOUNT_MANAGEMENT_TOOL_NAMES.has(name)) return 'account-management';
    if (SOCIAL_MESSAGES_TOOL_NAMES.has(name)) return 'social-messages';
    if (CLIPPER_PROJECTS_TOOL_NAMES.has(name)) return 'clipper-projects';
    if (EDITOR_TOOL_NAMES.has(name)) return 'editor';
    if (STORYBOARD_TOOL_NAMES.has(name)) return 'storyboard-capabilities';
    if (PRESET_TOOL_NAMES.has(name)) return 'presets';
    if (MODELS3D_TOOL_NAMES.has(name)) return 'models3d';
    if (REMIX_TOOL_NAMES.has(name)) return 'remix';
    if (SCHEDULER_TOOL_NAMES.has(name)) return 'scheduler';
    if (SKILLS_PRO_TOOL_NAMES.has(name)) return 'skills-pro';
    return 'unknown';
  }

  private async executeTool(
    name: string,
    args: Record<string, unknown>,
    approvedApprovalId?: string,
  ) {
    const result = await this.dispatchTool(name, args, approvedApprovalId);
    const kind = ToolRegistryService.classify(name);
    return finalizeMcpToolResult(
      name,
      result,
      // Both run through the API agent executor, which already gates results.
      kind === 'agent-executor' || kind === 'onboarding',
      this.clientService,
      this.logger,
    );
  }

  private async dispatchTool(
    name: string,
    args: Record<string, unknown>,
    approvedApprovalId?: string,
  ) {
    switch (ToolRegistryService.classify(name)) {
      case 'tool-discovery':
        return handleToolDiscoveryTool(this, name, args);
      case 'agent-chat':
        return handleAgentChatTool(this.clientService, name, args);
      case 'workflow-control':
        return handleWorkflowControlTool(this.clientService, name, args);
      case 'agent-executor': {
        const result = await this.clientService.executeAgentTool(
          name,
          // Brand and account cards show the brand's logo.
          name === 'get_brands' || name === 'get_account'
            ? { ...args, includeLogo: true }
            : args,
          approvedApprovalId ? { approvedApprovalId } : undefined,
        );
        return this.toMcpResult(
          await withAccountOrganizations(
            await nameBrands(result, name, this.clientService, this.logger),
            name,
            this.clientService,
            this.logger,
          ),
          name,
        );
      }
      case 'onboarding': {
        const { agentToolName, parameters, timeoutMs } =
          resolveOnboardBrandCall(args);
        const result = await this.clientService.executeAgentTool(
          agentToolName,
          parameters,
          undefined,
          timeoutMs,
        );
        return this.toMcpResult(result, name);
      }
      case 'content':
        return handleContentTool(this.clientService, name, args);
      case 'analytics':
        return handleAnalyticsTool(this.clientService, name, args);
      case 'workflow-status':
        return handleWorkflowStatusTool(this.clientService, name, args);
      case 'meta-ads':
        return handleMetaAdsTool(this.clientService, name, args);
      case 'google-ads':
        return handleGoogleAdsTool(this.clientService, name, args);
      case 'tiktok-ads':
        return handleTikTokAdsTool(this.clientService, name, args);
      case 'ads-gateway':
        return handleAdsGatewayTool(this.clientService, name, args);
      case 'account-management':
        return handleAccountManagementTool(
          this.clientService,
          name,
          args,
          this.mediaOrigins(),
          this.logger,
        );
      case 'social-messages':
        return handleSocialMessagesTool(this.clientService, name, args);
      case 'clipper-projects':
        return handleClipperProjectsTool(this.clientService, name, args);
      case 'editor':
        return handleEditorTool(this.clientService, name, args);
      case 'workspace-app':
        return handleWorkspaceAppTool(
          this.clientService.workspaceApp,
          name,
          args,
        );
      case 'brand-kit':
        return handleBrandKitTool(this.clientService.brandKit, args);
      case 'storyboard-capabilities':
        return handleStoryboardTool(this.clientService, name, args);
      case 'presets':
        return handlePresetTool(this.clientService, name, args);
      case 'models3d':
        return handleModels3dTool(this.clientService, name, args);
      case 'remix':
        return handleRemixTool(this.clientService, name, args);
      case 'scheduler':
        return handleSchedulerTool(
          this.clientService,
          name,
          args,
          approvedApprovalId,
        );
      case 'skills-pro':
        return handleSkillsProTool(this.clientService, name, args);
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  /**
   * Approve or decline a previously-queued write. On approval, the original tool
   * is executed (bypassing the approval gate) and its result is persisted on the
   * approval record. Approval itself only happens in the Genfeed review inbox:
   * `approve` here redeems an approval a person already granted there, so no
   * agent can approve its own queued write.
   */
  private async handleResolveApproval(args: Record<string, unknown>) {
    const approvalId = String(args.approvalId ?? '');
    const decision =
      args.decision === 'approve'
        ? 'approve'
        : args.decision === 'decline'
          ? 'decline'
          : null;

    if (!approvalId || !decision) {
      throw new Error(
        'approvalId and decision (approve | decline) are required',
      );
    }

    if (decision === 'decline') {
      await this.clientService.resolveApproval(approvalId, 'decline');
      return this.textResult('Approval declined. The action was not executed.');
    }

    const approval = await this.claimApprovalOrRecoverRetry(approvalId);
    return this.runApprovedApproval(approval);
  }

  /**
   * The Approve and Decline buttons on the approval card (#9754). The click
   * and a model's tool call reach the server as the same request, so only a
   * call carrying the proof minted for this approval and this member counts as
   * the person's answer. The API still accepts it only from the member who
   * asked for the action, as an owner or admin.
   */
  private handleAnswerApproval(args: Record<string, unknown>) {
    const answer = readCardApprovalAnswer(this.cardApprovalProofs, args);
    return this.answerApproval(answer, undefined, undefined);
  }

  /** Settle a requester's answer, then run, re-queue or report it. */
  private async answerApproval(
    answer: McpApprovalAnswer,
    toolName: string | undefined,
    args: Record<string, unknown> | undefined,
  ) {
    const settled = await settleApprovalAnswer(
      this.clientService,
      this.logger,
      toolName,
      answer,
    );
    if (settled.kind === 'run') {
      return await this.runApprovedApproval(settled.approval);
    }
    return settled.kind === 'pending'
      ? await this.pendingResult(
          settled.approval,
          args ?? settled.approval.arguments ?? {},
        )
      : this.textResult(settled.message);
  }

  /**
   * Run an APPROVED approval exactly once and persist its outcome. Reached from
   * `resolve_approval` and when the requester repeats a call a reviewer has
   * since approved in the Genfeed review inbox (#7340).
   */
  private async runApprovedApproval(approval: McpApprovalResource) {
    const approvalId = approval.id;
    // Defense-in-depth: only execute tools that are actually approval-gated, so
    // a stray approval row created for a non-write tool cannot be run via the
    // admin resolve path.
    if (!isMcpApprovalRedeemable(approval.toolName)) {
      const message = `Approval ${approvalId} references a read-only tool "${approval.toolName}"; not executed.`;
      await this.attachApprovalResultSafe(approvalId, { error: message });
      throw new Error(message);
    }

    // Agent-executor tools record their own outcome on the API, inside the
    // execution fence. A failure that never reached that fence (identity or
    // authorization check, transport) consumed nothing, so it must not be
    // written onto the approval: that would make it permanently unredeemable.
    const apiOwnsOutcome =
      ToolRegistryService.classify(approval.toolName) === 'agent-executor';

    // Direct-dispatch tools have no API-side fence, so they take the
    // execution claim here: whoever loses it must not run the tool again.
    if (
      !apiOwnsOutcome &&
      !(await this.clientService.claimApprovalExecution(approvalId))
    ) {
      throw new Error(
        `Approval ${approvalId} has already run or is running; not executed again.`,
      );
    }

    let result: Awaited<ReturnType<typeof this.executeTool>>;
    try {
      result = await this.executeTool(
        approval.toolName,
        approval.arguments ?? {},
        approval.id,
      );
    } catch (error: unknown) {
      if (!apiOwnsOutcome) {
        // Direct-dispatch tools have no API-side fence, so the failure is
        // recorded and the approval stays terminal to prevent a double run.
        await this.attachApprovalResultSafe(approvalId, {
          error: (error as Error)?.message ?? String(error),
        });
      }
      throw error;
    }

    if (apiOwnsOutcome && (result as { isError?: boolean }).isError) {
      return result;
    }

    await this.attachApprovalResultSafe(
      approvalId,
      result as Record<string, unknown>,
    );

    return result;
  }

  /**
   * Redeem an approval a reviewer already approved in the Genfeed review inbox.
   * The MCP caller never approves: whoever drives this connection may be a
   * model reading untrusted content, so it must not be able to approve its own
   * queued write. A PENDING approval is refused with the inbox link; an
   * APPROVED one with no recorded outcome runs, and {@link runApprovedApproval}
   * fences that run to at most once (the API fences agent-executor tools,
   * direct-dispatch tools take the execution claim first).
   */
  private async claimApprovalOrRecoverRetry(
    approvalId: string,
  ): Promise<McpApprovalResource> {
    const existing = await this.clientService.getApproval(approvalId);
    if (!existing) {
      throw new Error(`Approval ${approvalId} not found.`);
    }
    if (existing.status === 'APPROVED' && !existing.result) {
      return existing;
    }
    if (existing.status === 'PENDING') {
      throw new Error(
        `Approval ${approvalId} is waiting for a person to approve it in the Genfeed review inbox. Approve it there, then call resolve_approval again to run it.`,
      );
    }
    throw new Error(`Approval ${approvalId} already resolved; not executed.`);
  }

  /**
   * Persist a result/error on an approved approval without letting an audit-write
   * failure mask the actual tool outcome.
   */
  private async attachApprovalResultSafe(
    approvalId: string,
    result: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.clientService.attachApprovalResult(approvalId, result);
    } catch (error: unknown) {
      this.logger.error(
        `Failed to attach result to approval ${approvalId}:`,
        error,
      );
    }
  }

  private async pendingResult(
    approval: McpApprovalResource,
    args: Record<string, unknown>,
    invalidReleases: IScheduledReleaseBatchItemError[] = [],
  ) {
    const canResolveApproval = this.getTools().some(
      (candidate) => candidate.name === 'resolve_approval',
    );
    const batch = await batchPendingFor(
      this.clientService,
      approval,
      invalidReleases,
      this.logger,
    );
    // The card answers through `answer_approval`, which this connection must
    // list; a connection without it keeps the review-inbox link.
    const proof = this.getTools().some(
      (candidate) => candidate.name === 'answer_approval',
    )
      ? this.cardApprovalProofs?.mint(approval.id)
      : undefined;
    const result = withApprovalCard(
      pendingApprovalResult(
        approval,
        args,
        canResolveApproval,
        batch,
        proof !== undefined,
      ),
    );
    // `_meta` reaches the card view and stays out of the model's context.
    return proof === undefined
      ? result
      : { ...result, _meta: { [CARD_APPROVAL_PROOF_META_KEY]: proof } };
  }

  private textResult(text: string) {
    return { content: [{ text, type: 'text' }] };
  }

  private mediaOrigins(): string[] {
    return [
      this.configService?.get('GENFEEDAI_CDN_URL') || 'https://cdn.genfeed.ai',
    ];
  }

  private toMcpResult(result: AgentToolResult, name: string) {
    if (!result.success) {
      const gated = toMcpToolErrorResult(
        result.error ?? 'Tool execution failed',
      );
      if (gated) return gated;
      return {
        content: [
          {
            text: `Error: ${result.error ?? 'Tool execution failed'}`,
            type: 'text',
          },
        ],
        structuredContent: {
          failure: { ...formatAgentError(result.error), detail: null },
        },
        isError: true,
      };
    }

    const payload = result.data ?? {};
    if (serializeMediaArtifact(payload)) {
      return toNativeMcpMediaResult(
        payload,
        this.mediaOrigins(),
        this.logger,
      ).then((media) => this.stampCreditsDebited(media, result.creditsUsed));
    }
    const response = dataToolResult(
      payload,
      name === 'get_account' ? undefined : getToolByName(name)?.title,
    );
    // The card keeps the signed logos; the model's text does not.
    if ((name === 'get_brands' || name === 'get_account') && isRecord(payload))
      response.content[0].text = dataToolResult(
        withoutBrandLogos(payload),
        getToolByName(name)?.title,
      ).content[0].text;
    // The same receipts a chat answer cites, so an external client can cite
    // the exact source versions behind each passage.
    if (name === 'search_knowledge')
      Object.assign(response.structuredContent, {
        receipts: readKnowledgeSearchReceipts(payload),
      });
    if (name === 'get_account')
      response.content[0].text = accountToolText(payload, {
        brandsUrl: `${getPublicAppUrl()}${APP_ROUTES.SETTINGS.BRANDS}`,
      });
    return this.stampCreditsDebited(response, result.creditsUsed);
  }

  private stampCreditsDebited<T extends { structuredContent?: object }>(
    response: T,
    creditsUsed: number,
  ): T {
    if (!response.structuredContent) return response;
    return {
      ...response,
      structuredContent: {
        ...response.structuredContent,
        creditsDebited: creditsUsed,
      },
    } as T;
  }

  async handleResourceRead(params: ResourceReadParams) {
    const { uri } = params;

    this.logger.debug(`Reading resource: ${uri}`);

    try {
      if (isContentCardsUri(uri)) {
        return {
          contents: [
            {
              ...cardResource(
                [
                  this.configService?.get('GENFEEDAI_CDN_URL') ||
                    'https://cdn.genfeed.ai',
                  this.configService?.get(
                    'GENFEEDAI_MICROSERVICES_FILES_URL',
                  ) || '',
                ],
                `${new URL(SATOSHI_FONT_RESOURCE_PATH, getPublicMcpUrl()).href}?v=${MCP_CARD_RESOURCE_HASH}`,
              ),
              uri,
            },
          ],
        };
      }

      if (isBrandContextUri(uri)) {
        return await readBrandContextResource(uri, {
          executeTool: (toolName, parameters, context) =>
            this.clientService.executeAgentTool(toolName, parameters, context),
          isToolAllowed: (toolName) =>
            isToolAllowedInMcpAccessMode(
              this.requestAccessMode,
              toolName,
              'agent',
            ),
          listBrands: () => listCallerBrands(this.clientService),
        });
      }

      switch (uri) {
        case McpResourceUri.AGENT_GUIDE:
          if (this.requestAccessMode === 'admin') {
            return markdownResource(
              uri,
              `# Genfeed admin\nThis connection lists only the admin-only tools, for organization owners and admins. Content, brand and generation tools are on the standard connection.`,
            );
          }
          return this.requestAccessMode === 'claude'
            ? markdownResource(
                uri,
                `# Genfeed for Claude\nManage brands, drafts, scheduling and analytics with existing assets. This connector does not generate images, video or audio, and cannot run workflows, batches, remix or approval redemption.`,
              )
            : agentGuideResource(uri);

        case McpResourceUri.VIDEO_ANALYTICS:
          return jsonResource(
            uri,
            await this.clientService.getVideoAnalytics(),
          );

        case McpResourceUri.ORGANIZATION_ANALYTICS:
          return jsonResource(
            uri,
            await this.clientService.getOrganizationAnalytics(),
          );

        default:
          throw new Error(`Unknown resource: ${uri}`);
      }
    } catch (error: unknown) {
      this.logger.error(`Error reading resource ${uri}:`, error);
      throw error;
    }
  }
}
