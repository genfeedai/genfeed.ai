import {
  getToolByName,
  getToolsForSurface,
  type McpToolOutput,
  toMcpTools,
} from '@genfeedai/actions';
import { AgentToolName, type AgentToolResult } from '@genfeedai/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { McpAuthGuard } from '@mcp/guards/mcp-auth.guard';
import {
  MCP_RESOURCES,
  McpResourceUri,
  PUBLIC_MCP_RESOURCES,
} from '@mcp/mcp/resource-catalog';
import { AuthService, type McpRole } from '@mcp/services/auth.service';
import { ClientService } from '@mcp/services/client.service';
import type { McpApprovalResource } from '@mcp/shared/interfaces/approval.interface';
import type { McpResource } from '@mcp/shared/interfaces/mcp-resource.interface';
import { handleAccountManagementTool } from '@mcp/tools/account-management.tool';
import { handleAdsGatewayTool } from '@mcp/tools/ads-gateway.tool';
import { handleAgentChatTool } from '@mcp/tools/agent-chat.tool';
import {
  CLIP_PROJECTS_TOOL_NAMES,
  handleClipProjectsTool,
} from '@mcp/tools/clip-projects.tool';
import { handleGoogleAdsTool } from '@mcp/tools/google-ads.tool';
import { handleMetaAdsTool } from '@mcp/tools/meta-ads.tool';
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
import { handleTikTokAdsTool } from '@mcp/tools/tiktok-ads.tool';
import { handleWorkflowControlTool } from '@mcp/tools/workflow-control.tool';
import { Injectable, type OnModuleInit, Optional } from '@nestjs/common';

interface ToolCallParams {
  name: string;
  arguments: Record<string, unknown>;
}

interface ResourceReadParams {
  uri: string;
}

const AGENT_EXECUTOR_TOOL_NAMES: ReadonlySet<string> = new Set<string>(
  Object.values(AgentToolName),
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
 * Names handled by the hand-written `handleLegacyTool` switch. This set is the
 * classification source of truth for that branch; the switch must handle exactly
 * these names (asserted by the drift guard + `tool-registry.dispatch.spec`).
 */
const LEGACY_TOOL_NAMES: ReadonlySet<string> = new Set<string>([
  'get_video_status',
  'list_videos',
  'get_video_analytics',
  'create_article',
  'search_articles',
  'get_article',
  'list_images',
  'list_avatars',
  'list_music',
  'get_workflow_status',
  'list_workflow_templates',
  'get_content_analytics',
  'get_usage_stats',
  'generate_linkedin_content',
  'get_linkedin_connection_status',
  'get_linkedin_analytics',
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
 * precedence exactly (agent-chat → workflow-control → agent-executor → legacy →
 * external), so classification never changes which handler runs.
 */
type ExecutorKind =
  | 'agent-chat'
  | 'workflow-control'
  | 'agent-executor'
  | 'legacy'
  | 'meta-ads'
  | 'google-ads'
  | 'tiktok-ads'
  | 'ads-gateway'
  | 'account-management'
  | 'social-messages'
  | 'clip-projects'
  | 'scheduler'
  | 'skills-pro'
  | 'unknown';

/**
 * Mutating MCP tools that must NOT execute immediately — instead they persist a
 * pending approval (human-in-the-loop) and only run once approved. Names are the
 * canonical tool names from `packages/actions/src/registry/source`. High-risk and
 * expensive mutations (content creation, batch generation, external sends).
 * Extend deliberately.
 *
 * Every entry must be MCP-surfaced (`surfaces.mcp`), or the boot-time drift
 * guard rejects it — see {@link validateDispatchCoverage}.
 */
const APPROVAL_REQUIRED_TOOLS: ReadonlySet<string> = new Set<string>([
  'create_post',
  'create_article',
  // Batch content generation — expensive multi-item write (agent-executor).
  'generate_content_batch',
  // Brand context interview — mutating tools require user confirmation
  'start_brand_interview',
  'submit_brand_interview_answer',
  'skip_brand_interview_question',
  // Social messages — external sends require approval
  'approve_social_draft',
  'post_social_reply',
  'send_social_dm',
  // Clip projects — resource creation + credit-spending compute require approval
  'analyze_clip_project',
  'create_clip_project_from_youtube',
  'generate_clips',
  // Inspiration remixes — tenant writes remain draft-only until approved
  'create_ad_remix_workflow',
  'create_instagram_remix_workflow',
  // Scheduler releases — stateful publishing mutations require confirmation
  'create_scheduled_release',
  'update_scheduled_release',
  'control_scheduled_release',
  // Proprietary pack installs write the tenant runtime skill store.
  'install_skills_pro_skill',
]);

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
   * (2) every approval-gated name is actually MCP-surfaced (a stale entry would
   * make the tool unreachable while still claiming to need approval).
   */
  static validateDispatchCoverage(): void {
    const mcpTools = toMcpTools(getToolsForSurface('mcp'));
    const mcpNames = new Set(mcpTools.map((tool) => tool.name));

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

    const approvalNotSurfaced = [...APPROVAL_REQUIRED_TOOLS].filter(
      (name) => !mcpNames.has(name),
    );
    if (approvalNotSurfaced.length > 0) {
      throw new Error(
        `MCP approval-gate drift: APPROVAL_REQUIRED_TOOLS names are not ` +
          `MCP-surfaced [${approvalNotSurfaced.join(', ')}]. Remove them or ` +
          `set surfaces.mcp on the canonical tool.`,
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
  ) {}

  /**
   * Every MCP-surfaced tool, unfiltered. Prefer {@link getToolsForRole} for
   * anything a client sees — an unfiltered list advertises tools the caller
   * cannot invoke.
   */
  getAllTools(): McpToolOutput[] {
    return toMcpTools(getToolsForSurface('mcp'));
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

  getTools(): McpToolOutput[] {
    return this.getToolsForRole(this.requestRole);
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
      return {
        content: [
          {
            text: `Error: ${(error as Error)?.message ?? String(error)}`,
            type: 'text',
          },
        ],
        isError: true,
      };
    }
  }

  /**
   * Classify a tool name to the executor that will run it, WITHOUT executing.
   * Single source of truth for dispatch — used by {@link executeTool} and by the
   * boot-time drift guard. Precedence is identical to the historical if/switch
   * chain, so routing is behaviour-preserving.
   */
  static classify(name: string): ExecutorKind {
    if (AGENT_CHAT_TOOL_NAMES.has(name)) return 'agent-chat';
    if (WORKFLOW_CONTROL_TOOL_NAMES.has(name)) return 'workflow-control';
    if (AGENT_EXECUTOR_TOOL_NAMES.has(name)) return 'agent-executor';
    if (LEGACY_TOOL_NAMES.has(name)) return 'legacy';
    if (isMetaAdsTool(name)) return 'meta-ads';
    if (isGoogleAdsTool(name)) return 'google-ads';
    if (isTikTokAdsTool(name)) return 'tiktok-ads';
    if (isAdsGatewayTool(name)) return 'ads-gateway';
    if (ACCOUNT_MANAGEMENT_TOOL_NAMES.has(name)) return 'account-management';
    if (SOCIAL_MESSAGES_TOOL_NAMES.has(name)) return 'social-messages';
    if (CLIP_PROJECTS_TOOL_NAMES.has(name)) return 'clip-projects';
    if (SCHEDULER_TOOL_NAMES.has(name)) return 'scheduler';
    if (SKILLS_PRO_TOOL_NAMES.has(name)) return 'skills-pro';
    return 'unknown';
  }

  private static requiresApproval(name: string): boolean {
    return APPROVAL_REQUIRED_TOOLS.has(name);
  }

  private async executeTool(name: string, args: Record<string, unknown>) {
    switch (ToolRegistryService.classify(name)) {
      case 'agent-chat':
        return handleAgentChatTool(this.clientService, name, args);
      case 'workflow-control':
        return handleWorkflowControlTool(this.clientService, name, args);
      case 'agent-executor': {
        const result = await this.clientService.executeAgentTool(name, args);
        return this.toMcpResult(result);
      }
      case 'legacy':
        return this.handleLegacyTool(name, args);
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
    return {
      content: [
        {
          text:
            'This action requires approval before it runs.\n\n' +
            `Approval ID: ${approval.id}\n` +
            `Tool: ${approval.toolName}\n` +
            `Status: ${approval.status}\n\n` +
            'A reviewer has been notified. To proceed, call `resolve_approval` ' +
            `with approvalId "${approval.id}" and decision "approve" (or "decline" to cancel).`,
          type: 'text',
        },
      ],
    };
  }

  private textResult(text: string) {
    return { content: [{ text, type: 'text' }] };
  }

  private toMcpResult(result: AgentToolResult) {
    if (!result.success) {
      return {
        content: [
          {
            text: `Error: ${result.error ?? 'Tool execution failed'}`,
            type: 'text',
          },
        ],
        isError: true,
      };
    }

    const payload = result.data ?? {};
    return {
      content: [
        {
          text: JSON.stringify(payload, null, 2),
          type: 'text',
        },
      ],
    };
  }

  private async handleLegacyTool(name: string, args: Record<string, unknown>) {
    switch (name) {
      case 'get_video_status': {
        if (!args || !args.videoId) {
          throw new Error('videoId required');
        }
        const status = await this.clientService.getVideoStatus(
          args.videoId as string,
        );
        return {
          content: [
            {
              text: `Video Status: ${status.status}\nProgress: ${status.progress}%\n${status.message || ''}${status.url ? `\nURL: ${status.url}` : ''}`,
              type: 'text',
            },
          ],
        };
      }

      case 'list_videos': {
        const limit = (args?.limit as number) || 10;
        const offset = (args?.offset as number) || 0;
        const videos = await this.clientService.listVideos(limit, offset);
        return {
          content: [
            {
              text:
                videos.length > 0
                  ? `Found ${videos.length} videos:\n\n${JSON.stringify(videos, null, 2)}`
                  : 'No videos found.',
              type: 'text',
            },
          ],
        };
      }

      case 'get_video_analytics': {
        if (!args || !args.videoId) {
          throw new Error('videoId required');
        }
        const videoId = args.videoId as string;
        const timeRange = (args.timeRange as string) || '7d';
        const analytics = await this.clientService.getVideoAnalytics(
          videoId,
          timeRange,
        );
        return {
          content: [
            {
              text: `Video Analytics (${timeRange}):\n\n${JSON.stringify(analytics, null, 2)}`,
              type: 'text',
            },
          ],
        };
      }

      case 'create_article': {
        if (!args || !args.topic) {
          throw new Error('topic required');
        }
        const article = await this.clientService.createArticle({
          keywords: args.keywords as string[] | undefined,
          length: args.length as 'short' | 'medium' | 'long' | undefined,
          targetAudience: args.targetAudience as string | undefined,
          tone: args.tone as
            | 'professional'
            | 'casual'
            | 'humorous'
            | 'technical'
            | 'storytelling'
            | undefined,
          topic: args.topic as string,
        });

        return {
          component: {
            height: 600,
            type: 'iframe',
            url: `https://chatgpt.genfeed.ai/article-preview?id=${article.id}`,
          },
          content: [
            {
              text: `Article created successfully!\n\nArticle ID: ${article.id}\nTitle: ${article.title}\nStatus: ${article.status}\nWord Count: ${article.wordCount}`,
              type: 'text',
            },
          ],
        };
      }

      case 'search_articles': {
        if (!args || !args.query) {
          throw new Error('query required');
        }
        const articles = await this.clientService.searchArticles({
          category: args.category as string | undefined,
          limit: args.limit as number | undefined,
          query: args.query as string,
        });

        return {
          component: {
            height: 500,
            type: 'iframe',
            url: `https://chatgpt.genfeed.ai/article-list?q=${encodeURIComponent(args.query as string)}`,
          },
          content: [
            {
              text:
                articles.length > 0
                  ? `Found ${articles.length} articles matching "${args.query}":\n\n${JSON.stringify(articles, null, 2)}`
                  : `No articles found matching "${args.query}".`,
              type: 'text',
            },
          ],
        };
      }

      case 'get_article': {
        if (!args || !args.articleId) {
          throw new Error('articleId required');
        }
        const article = await this.clientService.getArticle(
          args.articleId as string,
        );
        return {
          component: {
            height: 600,
            type: 'iframe',
            url: `https://chatgpt.genfeed.ai/article-preview?id=${args.articleId}`,
          },
          content: [
            {
              text: `Article: ${article.title}\n\nID: ${article.id}\nStatus: ${article.status}\nWord Count: ${article.wordCount}\nCreated: ${article.createdAt}\n\nContent Preview:\n${article.content?.substring(0, 500)}...`,
              type: 'text',
            },
          ],
        };
      }

      case 'list_images': {
        const images = await this.clientService.listImages({
          limit: args?.limit as number | undefined,
          offset: args?.offset as number | undefined,
        });
        return {
          component: {
            height: 600,
            type: 'iframe',
            url: `https://chatgpt.genfeed.ai/image-gallery`,
          },
          content: [
            {
              text:
                images.length > 0
                  ? `Found ${images.length} images:\n\n${JSON.stringify(images, null, 2)}`
                  : 'No images found.',
              type: 'text',
            },
          ],
        };
      }

      case 'list_avatars': {
        const avatars = await this.clientService.listAvatars({
          limit: args?.limit as number | undefined,
        });
        return {
          content: [
            {
              text:
                avatars.length > 0
                  ? `Found ${avatars.length} avatars:\n\n${JSON.stringify(avatars, null, 2)}`
                  : 'No avatars found.',
              type: 'text',
            },
          ],
        };
      }

      case 'list_music': {
        const musicTracks = await this.clientService.listMusic({
          limit: args?.limit as number | undefined,
        });
        return {
          content: [
            {
              text:
                musicTracks.length > 0
                  ? `Found ${musicTracks.length} music tracks:\n\n${JSON.stringify(musicTracks, null, 2)}`
                  : 'No music tracks found.',
              type: 'text',
            },
          ],
        };
      }

      case 'get_workflow_status': {
        if (!args || !args.workflowId) {
          throw new Error('workflowId required');
        }
        const workflow = await this.clientService.getWorkflowStatus(
          args.workflowId as string,
        );

        return {
          content: [
            {
              text: `Workflow Status: ${workflow.name}\n\nID: ${workflow.id}\nStatus: ${workflow.status}\nVersion: ${workflow.version ?? 'N/A'}\nNodes: ${workflow.nodeCount ?? 0}\nLast Run: ${workflow.lastRunAt || 'Never'}\nNext Run: ${workflow.nextRunAt || 'Not scheduled'}`,
              type: 'text',
            },
          ],
        };
      }

      case 'list_workflow_templates': {
        const templates = await this.clientService.listWorkflowTemplates();

        return {
          content: [
            {
              text:
                templates.length > 0
                  ? `Available Workflow Templates:\n\n${templates.map((t) => `- ${t.name} (${t.id})\n  ${t.description}\n  Category: ${t.category}${t.creditsRequired ? `\n  Credits: ${t.creditsRequired}` : ''}`).join('\n\n')}`
                  : 'No workflow templates available.',
              type: 'text',
            },
          ],
        };
      }

      case 'get_content_analytics': {
        if (!args || !args.contentId || !args.contentType) {
          throw new Error('contentId and contentType required');
        }

        const contentId = args.contentId as string;
        const contentType = args.contentType as string;

        if (contentType === 'video') {
          const analytics = await this.clientService.getVideoAnalytics(
            contentId,
            (args.timeRange as string) || '7d',
          );
          return {
            content: [
              {
                text: `Analytics for ${contentType} ${contentId}:\n\n${JSON.stringify(analytics, null, 2)}`,
                type: 'text',
              },
            ],
          };
        }

        // Articles and images route through the canonical agent executor
        // (`get_analytics`), which already owns content→published-post
        // resolution, per-collection analytics rollups, and tenant scoping.
        // Reusing it keeps the MCP and agent surfaces on one implementation
        // rather than two that drift — this branch used to return a hardcoded
        // "data is being compiled" string for exactly these two types.
        const result = await this.clientService.executeAgentTool(
          'get_analytics',
          { contentId },
        );

        if (!result.success) {
          throw new Error(
            result.error ||
              `Failed to get analytics for ${contentType} ${contentId}`,
          );
        }

        // `getPostAnalyticsSummary` and `getArticleAnalyticsSummary` both roll
        // up every recorded day, so this is a lifetime total; the declared
        // `timeRange` argument does not narrow it. Say so rather than stamping
        // a range the numbers do not honor.
        return {
          content: [
            {
              text: `Analytics for ${contentType} ${contentId} (lifetime totals):\n\n${JSON.stringify(result.data, null, 2)}`,
              type: 'text',
            },
          ],
        };
      }

      case 'get_usage_stats': {
        const stats = await this.clientService.getUsageStats(
          (args?.timeRange as string) || '30d',
        );
        return {
          component: {
            height: 500,
            type: 'iframe',
            url: `https://chatgpt.genfeed.ai/usage-stats?range=${args?.timeRange || '30d'}`,
          },
          content: [
            {
              text: `Usage Statistics (${stats.timeRange}):\n\nContent Created:\n- Videos: ${stats.contentCreated.videos}\n- Articles: ${stats.contentCreated.articles}\n- Images: ${stats.contentCreated.images}\n- Music: ${stats.contentCreated.music}\n- Avatars: ${stats.contentCreated.avatars}\n\nCredits Used: ${stats.creditsUsed}\nPosts Published: ${stats.postsPublished}\nTotal Engagement: ${stats.totalEngagement}`,
              type: 'text',
            },
          ],
        };
      }

      case 'generate_linkedin_content': {
        if (!args?.topic) {
          throw new Error('topic is required');
        }
        const linkedInContent =
          await this.clientService.generateLinkedInContent({
            brandId: args.brandId as string | undefined,
            topic: args.topic as string,
            variationsCount: (args.variationsCount as number) || 3,
          });
        return {
          content: [
            {
              text:
                linkedInContent.length > 0
                  ? `Generated ${linkedInContent.length} LinkedIn content variations:\n\n${JSON.stringify(linkedInContent, null, 2)}`
                  : 'No content generated.',
              type: 'text',
            },
          ],
        };
      }

      case 'get_linkedin_connection_status': {
        const connectionStatus =
          await this.clientService.getLinkedInConnectionStatus();
        return {
          content: [
            {
              text: JSON.stringify(connectionStatus, null, 2),
              type: 'text',
            },
          ],
        };
      }

      case 'get_linkedin_analytics': {
        if (!args?.contentId) {
          throw new Error('contentId is required');
        }
        const linkedInAnalytics = await this.clientService.getLinkedInAnalytics(
          args.contentId as string,
          (args.timeRange as string) || '7d',
        );
        return {
          content: [
            {
              text: JSON.stringify(linkedInAnalytics, null, 2),
              type: 'text',
            },
          ],
        };
      }

      default:
        // `executeTool` only routes `LEGACY_TOOL_NAMES` here, so this is
        // unreachable in practice; throw rather than silently returning
        // undefined if the two ever drift.
        throw new Error(`Unknown legacy tool: ${name}`);
    }
  }

  async handleResourceRead(params: ResourceReadParams) {
    const { uri } = params;

    this.logger.debug(`Reading resource: ${uri}`);

    try {
      switch (uri) {
        case McpResourceUri.AGENT_GUIDE:
          return {
            contents: [
              {
                mimeType: 'text/markdown',
                text: `# Genfeed agent guide

Use Genfeed for content research, AI generation, human review, scheduled publishing, and analytics. Protected tools and tenant resources require a scoped bearer credential.

- Product context: https://genfeed.ai/llms.txt
- Authentication: https://genfeed.ai/auth.md
- OpenAPI: https://api.genfeed.ai/v1/openapi.json
- MCP setup: https://docs.genfeed.ai/api-reference/mcp
- Contact: https://genfeed.ai/contact
`,
                uri,
              },
            ],
          };

        case McpResourceUri.VIDEO_ANALYTICS: {
          const videoAnalytics = await this.clientService.getVideoAnalytics();
          return {
            contents: [
              {
                mimeType: 'application/json',
                text: JSON.stringify(videoAnalytics, null, 2),
                uri,
              },
            ],
          };
        }

        case McpResourceUri.ORGANIZATION_ANALYTICS: {
          const orgAnalytics =
            await this.clientService.getOrganizationAnalytics();
          return {
            contents: [
              {
                mimeType: 'application/json',
                text: JSON.stringify(orgAnalytics, null, 2),
                uri,
              },
            ],
          };
        }

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
