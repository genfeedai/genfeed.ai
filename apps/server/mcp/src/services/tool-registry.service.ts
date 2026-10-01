import {
  getToolByName,
  getToolsetNames,
  getToolsForSurface,
  getToolsForToolsets,
  type McpToolOutput,
  type ToolsetName,
  toMcpTools,
} from '@genfeedai/actions';
import { formatAgentError } from '@genfeedai/agent/server';
import type { AgentToolResult } from '@genfeedai/contracts/interfaces';
import {
  serializeMediaArtifact,
  toMcpMediaToolResult,
} from '@genfeedai/helpers';
import { LoggerService } from '@libs/logger/logger.service';
import { ConfigService } from '@mcp/config/config.service';
import { McpAuthGuard } from '@mcp/guards/mcp-auth.guard';
import {
  MCP_RESOURCES,
  McpResourceUri,
  PUBLIC_MCP_RESOURCES,
} from '@mcp/mcp/resource-catalog';
import { AuthService, type McpRole } from '@mcp/services/auth.service';
import { ClientService } from '@mcp/services/client.service';
import {
  agentGuideResource,
  jsonResource,
} from '@mcp/services/mcp-resource-contents.util';
import { finalizeMcpToolResult } from '@mcp/services/mcp-tool-result.util';
import type { McpApprovalResource } from '@mcp/shared/interfaces/approval.interface';
import type { McpResource } from '@mcp/shared/interfaces/mcp-resource.interface';
import { handleAccountManagementTool } from '@mcp/tools/account-management.tool';
import { handleAdsGatewayTool } from '@mcp/tools/ads-gateway.tool';
import { handleAgentChatTool } from '@mcp/tools/agent-chat.tool';
import {
  ANALYTICS_TOOL_NAMES,
  handleAnalyticsTool,
} from '@mcp/tools/analytics.tool';
import {
  CLIP_PROJECTS_TOOL_NAMES,
  handleClipProjectsTool,
} from '@mcp/tools/clip-projects.tool';
import { CONTENT_TOOL_NAMES, handleContentTool } from '@mcp/tools/content.tool';
import { EDITOR_TOOL_NAMES, handleEditorTool } from '@mcp/tools/editor.tool';
import {
  GENERATION_TOOL_NAMES,
  handleGenerationTool,
} from '@mcp/tools/generation.tool';
import { handleGoogleAdsTool } from '@mcp/tools/google-ads.tool';
import {
  approvalPendingToolResult,
  toMcpToolErrorResult,
} from '@mcp/tools/mcp-tool-error';
import {
  handleMergeVideosTool,
  MERGE_VIDEOS_TOOL_NAMES,
} from '@mcp/tools/merge-videos';
import { handleMetaAdsTool } from '@mcp/tools/meta-ads.tool';
import { handleRemixTool, REMIX_TOOL_NAMES } from '@mcp/tools/remix.tool';
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
import { handleStoryboardTool } from '@mcp/tools/storyboard.tool';
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
import { cardResource } from '@mcp/ui/card-app';
import { MCP_CARD_RESOURCE_URI, withCardMetadata } from '@mcp/ui/card-data';
import { Injectable, type OnModuleInit, Optional } from '@nestjs/common';

interface ToolCallParams {
  name: string;
  arguments: Record<string, unknown>;
}

interface ResourceReadParams {
  uri: string;
}

const AGENT_EXECUTOR_TOOL_NAMES: ReadonlySet<string> = new Set<string>(
  getToolsForSurface('agent').map((tool) => tool.name),
);

const AGENT_CHAT_TOOL_NAMES: ReadonlySet<string> = new Set<string>([
  'create_chat',
  'send_chat_message',
]);

const WORKFLOW_CONTROL_TOOL_NAMES: ReadonlySet<string> = new Set<string>([
  'duplicate_workflow',
  'get_workflow_run',
  'inspect_workflow',
  'install_system_workflow',
  'list_system_workflow_catalog',
  'list_workflow_runs',
  'set_workflow_schedule',
]);

/**
 * Tools `handleToolCall` handles BEFORE `executeTool`, so they never flow
 * through classify-based dispatch. `resolve_approval` runs the deferred action
 * via its own path; the coverage guard must not treat it as unroutable.
 */
const PRE_DISPATCH_TOOL_NAMES: ReadonlySet<string> = new Set<string>([
  'resolve_approval',
]);

const ACCOUNT_MANAGEMENT_TOOL_NAMES: ReadonlySet<string> = new Set<string>([
  'get_account_info',
  'list_brands',
  'get_brand',
  'get_job_status',
]);

const isMetaAdsTool = (name: string): boolean =>
  name.startsWith('list_meta_') ||
  name.startsWith('get_meta_') ||
  name.startsWith('compare_meta_');

const isGoogleAdsTool = (name: string): boolean =>
  name.startsWith('list_google_ads_') || name.startsWith('get_google_ads_');

const isTikTokAdsTool = (name: string): boolean =>
  name.startsWith('list_tiktok_') || name.startsWith('get_tiktok_');

/**
 * Platform-generic ads gateway tools (`/ads/:platform/*`). The `get_ads_` prefix
 * is reserved for this executor — per-platform tools use their own platform
 * prefix (`get_meta_`, `get_google_ads_`), so the namespaces cannot overlap.
 */
const isAdsGatewayTool = (name: string): boolean => name.startsWith('get_ads_');

/**
 * Which executor handles a tool name. `'unknown'` means no dispatch path exists
 * — the drift guard rejects any MCP-surfaced tool that classifies as unknown so
 * a registry/handler mismatch fails the boot health check instead of surfacing
 * as a runtime "Unknown tool" error. Order mirrors the historical dispatch
 * precedence exactly (tool-discovery → agent-chat → workflow-control →
 * agent-executor → catalog REST handlers → ads/external), so classification
 * never changes which handler runs. `tool-discovery` is checked first since
 * its names (e.g. `describe_tool`) are meta tools with no other executor to
 * shadow.
 */
type ExecutorKind =
  | 'tool-discovery'
  | 'agent-chat'
  | 'workflow-control'
  | 'agent-executor'
  | 'merge-videos'
  | 'generation'
  | 'content'
  | 'analytics'
  | 'workflow-status'
  | 'meta-ads'
  | 'google-ads'
  | 'tiktok-ads'
  | 'ads-gateway'
  | 'account-management'
  | 'social-messages'
  | 'clip-projects'
  | 'editor'
  | 'storyboard-capabilities'
  | 'remix'
  | 'scheduler'
  | 'skills-pro'
  | 'unknown';

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
    const mcpTools = toMcpTools(getToolsForSurface('mcp'));

    const unroutable = mcpTools
      .map((tool) => tool.name)
      .filter((name) => !PRE_DISPATCH_TOOL_NAMES.has(name))
      .filter((name) => ToolRegistryService.classify(name) === 'unknown');
    if (unroutable.length > 0) {
      throw new Error(
        `MCP tool registry drift: no executor dispatch for [${unroutable.join(
          ', ',
        )}]. Add a handler + classify() entry, or unset surfaces.mcp.`,
      );
    }
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
    // The caller's resolved toolset selection (`resolveMcpToolQuery`). Empty
    // means "every toolset" — `?profile=full`, and the DI singleton, which
    // never threads a per-request selection and resolves toolsets per call
    // via {@link getToolsForRoleAndToolsets}. The bare URL passes the default
    // profile list, not an empty selection.
    @Optional() private readonly requestToolsets: readonly ToolsetName[] = [],
    @Optional() private readonly configService?: ConfigService,
  ) {}

  /**
   * Every MCP-surfaced tool, unfiltered. Prefer {@link getToolsForRole} for
   * anything a client sees — an unfiltered list advertises tools the caller
   * cannot invoke.
   */
  getAllTools(): McpToolOutput[] {
    return toMcpTools(getToolsForSurface('mcp')).map(withCardMetadata);
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

  getToolsForRole(role: McpRole): McpToolOutput[] {
    return ToolRegistryService.filterToolsByRole(this.getAllTools(), role);
  }

  /**
   * Tools a role may invoke, narrowed to the requested toolsets (union'd with
   * the always-on `core` toolset — `getToolsForToolsets` owns that union) or
   * every tool when `toolsets` is empty. This is what `tools/list` and the
   * REST mirror actually advertise; `handleToolCall` never filters by
   * toolset, so a client can still call a tool outside its current
   * `tools/list` view.
   */
  getToolsForRoleAndToolsets(
    role: McpRole,
    toolsets: readonly ToolsetName[],
  ): McpToolOutput[] {
    return ToolRegistryService.filterToolsByRole(
      toMcpTools(getToolsForToolsets('mcp', toolsets)).map(withCardMetadata),
      role,
    );
  }

  getTools(): McpToolOutput[] {
    return this.getToolsForRoleAndToolsets(
      this.requestRole,
      this.requestToolsets,
    );
  }

  /**
   * The role-filtered full catalog, ignoring the caller's `?toolsets=`
   * selection. Backs `list_toolsets`/`search_tools`/`describe_tool` — a
   * client should be able to discover a tool outside its currently-loaded
   * toolset so it can reconnect with a broader selection.
   */
  getDiscoverableTools(): McpToolOutput[] {
    return this.getToolsForRole(this.requestRole);
  }

  /**
   * Requested toolset names that exist in the catalog but have no MCP tools
   * on this deploy. `list_toolsets` warns about them; they are not a failed
   * connection. An empty request selection (`?profile=full`) warns about
   * nothing — the caller did not name a specific empty toolset.
   */
  getIgnoredEmptyToolsets(): readonly ToolsetName[] {
    const present = new Set(getToolsetNames('mcp'));
    return this.requestToolsets
      .filter((name) => !present.has(name))
      .sort((a, b) => a.localeCompare(b));
  }

  getResources(): McpResource[] {
    return [...MCP_RESOURCES];
  }

  getPublicResources(): McpResource[] {
    return [...PUBLIC_MCP_RESOURCES];
  }

  async handleToolCall(params: ToolCallParams) {
    const { name, arguments: args } = params;

    this.logger.debug(`Handling tool call: ${name}`, args);

    try {
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

      // The resolver runs the deferred action; it must not be gated as a write.
      if (name === 'resolve_approval') {
        return await this.handleResolveApproval(args ?? {});
      }

      // Mutating tools persist a pending approval instead of executing.
      if (ToolRegistryService.requiresApproval(name)) {
        const approval = await this.clientService.createApproval(
          name,
          args ?? {},
        );
        return this.pendingApprovalResult(approval);
      }

      return await this.executeTool(name, args ?? {});
    } catch (error: unknown) {
      this.logger.error(`Error handling tool call ${name}:`, error);
      const gated = toMcpToolErrorResult(error);
      if (gated) return gated;
      return {
        content: [
          {
            text: `Error: ${(error as Error)?.message ?? String(error)}`,
            type: 'text',
          },
        ],
        structuredContent: {
          failure: {
            ...formatAgentError(
              error instanceof Error ? error.message : String(error),
            ),
            detail: null,
          },
        },
        isError: true,
      };
    }
  }

  /** Classify a tool name to its executor. Precedence matches the historical chain. */
  static classify(name: string): ExecutorKind {
    if (TOOL_DISCOVERY_TOOL_NAMES.has(name)) return 'tool-discovery';
    if (AGENT_CHAT_TOOL_NAMES.has(name)) return 'agent-chat';
    if (WORKFLOW_CONTROL_TOOL_NAMES.has(name)) return 'workflow-control';
    if (AGENT_EXECUTOR_TOOL_NAMES.has(name)) return 'agent-executor';
    if (MERGE_VIDEOS_TOOL_NAMES.has(name)) return 'merge-videos';
    if (GENERATION_TOOL_NAMES.has(name)) return 'generation';
    if (CONTENT_TOOL_NAMES.has(name)) return 'content';
    if (ANALYTICS_TOOL_NAMES.has(name)) return 'analytics';
    if (WORKFLOW_STATUS_TOOL_NAMES.has(name)) return 'workflow-status';
    if (isMetaAdsTool(name)) return 'meta-ads';
    if (isGoogleAdsTool(name)) return 'google-ads';
    if (isTikTokAdsTool(name)) return 'tiktok-ads';
    if (isAdsGatewayTool(name)) return 'ads-gateway';
    if (ACCOUNT_MANAGEMENT_TOOL_NAMES.has(name)) return 'account-management';
    if (SOCIAL_MESSAGES_TOOL_NAMES.has(name)) return 'social-messages';
    if (CLIP_PROJECTS_TOOL_NAMES.has(name)) return 'clip-projects';
    if (EDITOR_TOOL_NAMES.has(name)) return 'editor';
    if (name === 'storyboard_run_capabilities')
      return 'storyboard-capabilities';
    if (REMIX_TOOL_NAMES.has(name)) return 'remix';
    if (SCHEDULER_TOOL_NAMES.has(name)) return 'scheduler';
    if (SKILLS_PRO_TOOL_NAMES.has(name)) return 'skills-pro';
    return 'unknown';
  }

  private static requiresApproval(name: string): boolean {
    return getToolByName(name)?.mutationPolicy === 'approval-required';
  }

  private async executeTool(
    name: string,
    args: Record<string, unknown>,
    approvedApprovalId?: string,
  ) {
    const result = await this.dispatchTool(name, args, approvedApprovalId);
    return finalizeMcpToolResult(
      name,
      result,
      ToolRegistryService.classify(name) === 'agent-executor',
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
          args,
          approvedApprovalId ? { approvedApprovalId } : undefined,
        );
        return this.toMcpResult(result);
      }
      case 'merge-videos':
        return handleMergeVideosTool(this.clientService, args ?? {});
      case 'generation':
        return handleGenerationTool(this.clientService, name, args);
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
        return handleAccountManagementTool(this.clientService, name, args);
      case 'social-messages':
        return handleSocialMessagesTool(this.clientService, name, args);
      case 'clip-projects':
        return handleClipProjectsTool(this.clientService, name, args);
      case 'editor':
        return handleEditorTool(this.clientService, name, args);
      case 'storyboard-capabilities':
        return handleStoryboardTool(this.clientService, name, args);
      case 'remix':
        return handleRemixTool(this.clientService, name, args);
      case 'scheduler':
        return handleSchedulerTool(this.clientService, name, args);
      case 'skills-pro':
        return handleSkillsProTool(this.clientService, name, args);
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  /**
   * Approve or decline a previously-queued write. On approval, the original tool
   * is executed (bypassing the approval gate) and its result is persisted on the
   * approval record. `resolve_approval` is admin-gated upstream, so a user-tier
   * agent cannot self-approve its own queued write.
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
      return this.textResult(
        `Approval ${approvalId} declined. The action was not executed.`,
      );
    }

    // Atomically CLAIM the approval (PENDING -> APPROVED) BEFORE executing the
    // tool. The API resolves via a conditional updateMany on status=PENDING, so
    // a concurrent resolve_approval for the same id loses the race and throws
    // "already resolved" here — which means the underlying tool runs at most
    // once even though the MCP server is stateless and handles each request in
    // isolation. (Previously the claim happened AFTER execution, leaving a
    // TOCTOU window where two callers could both execute an irreversible tool.)
    const approval = await this.clientService.resolveApproval(
      approvalId,
      'approve',
    );

    // Defense-in-depth: only execute tools that are actually approval-gated, so
    // a stray approval row created for a non-write tool cannot be run via the
    // admin resolve path.
    if (!ToolRegistryService.requiresApproval(approval.toolName)) {
      const message = `Approval ${approvalId} references non-approval-gated tool "${approval.toolName}"; not executed.`;
      await this.attachApprovalResultSafe(approvalId, { error: message });
      throw new Error(message);
    }

    let result: Awaited<ReturnType<typeof this.executeTool>>;
    try {
      result = await this.executeTool(
        approval.toolName,
        approval.arguments ?? {},
        approval.id,
      );
    } catch (error: unknown) {
      // The approval is already claimed; record the failure on the audit row so
      // the outcome is observable rather than a silently-APPROVED-but-failed row.
      await this.attachApprovalResultSafe(approvalId, {
        error: (error as Error)?.message ?? String(error),
      });
      throw error;
    }

    await this.attachApprovalResultSafe(
      approvalId,
      result as Record<string, unknown>,
    );

    return result;
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

  private pendingApprovalResult(approval: McpApprovalResource) {
    return approvalPendingToolResult(approval);
  }

  private textResult(text: string) {
    return { content: [{ text, type: 'text' }] };
  }

  private toMcpResult(result: AgentToolResult) {
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
      return toMcpMediaToolResult(payload);
    }
    return {
      content: [
        {
          text: JSON.stringify(payload, null, 2),
          type: 'text',
        },
      ],
      structuredContent: { data: payload },
    };
  }

  async handleResourceRead(params: ResourceReadParams) {
    const { uri } = params;

    this.logger.debug(`Reading resource: ${uri}`);

    try {
      switch (uri) {
        case MCP_CARD_RESOURCE_URI:
          return {
            contents: [
              cardResource([
                this.configService?.get('GENFEEDAI_CDN_URL') ||
                  'https://cdn.genfeed.ai',
                this.configService?.get('GENFEEDAI_MICROSERVICES_FILES_URL') ||
                  '',
              ]),
            ],
          };
        case McpResourceUri.AGENT_GUIDE:
          return agentGuideResource(uri);

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

  setBearerToken(token: string) {
    this.clientService.setBearerToken(token);
  }
}
