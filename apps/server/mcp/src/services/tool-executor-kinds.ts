import { getToolsForSurface } from '@genfeedai/actions';

/** Which executor serves each MCP tool name, for `ToolRegistryService.classify`. */

export const AGENT_EXECUTOR_TOOL_NAMES: ReadonlySet<string> = new Set<string>(
  getToolsForSurface('agent').map((tool) => tool.name),
);

export const AGENT_CHAT_TOOL_NAMES: ReadonlySet<string> = new Set<string>([
  'create_chat',
  'send_chat_message',
]);

export const WORKFLOW_CONTROL_TOOL_NAMES: ReadonlySet<string> = new Set<string>(
  [
    'duplicate_workflow',
    'get_system_workflow_catalog',
    'get_workflow_run',
    'get_workflow_runs',
    'inspect_workflow',
    'install_system_workflow',
    'set_workflow_schedule',
  ],
);

/**
 * Tools `handleToolCall` handles BEFORE `executeTool`, so they never flow
 * through classify-based dispatch. `resolve_approval` runs the deferred action
 * via its own path; the coverage guard must not treat it as unroutable.
 */
export const PRE_DISPATCH_TOOL_NAMES: ReadonlySet<string> = new Set<string>([
  'answer_approval',
  'resolve_approval',
]);

export const ACCOUNT_MANAGEMENT_TOOL_NAMES: ReadonlySet<string> =
  new Set<string>(['get_job_status', 'get_orgs']);

/**
 * Which executor handles a tool name. `'unknown'` means no dispatch path exists
 * — the drift guard rejects any MCP-surfaced tool that classifies as unknown so
 * a registry/handler mismatch fails the boot health check instead of surfacing
 * as a runtime "Unknown tool" error. Order mirrors the historical dispatch
 * precedence exactly (tool-discovery → agent-chat → workflow-control →
 * agent-executor → onboarding → catalog REST handlers → ads/external), so classification
 * never changes which handler runs. `tool-discovery` is checked first since
 * its name (`find_tools`) is a meta tool with no other executor to
 * shadow.
 */
export type ExecutorKind =
  | 'tool-discovery'
  | 'agent-chat'
  | 'workflow-control'
  | 'agent-executor'
  | 'onboarding'
  | 'content'
  | 'analytics'
  | 'workflow-status'
  | 'meta-ads'
  | 'google-ads'
  | 'tiktok-ads'
  | 'ads-gateway'
  | 'account-management'
  | 'social-messages'
  | 'clipper-projects'
  | 'editor'
  | 'workspace-app'
  | 'brand-kit'
  | 'storyboard-capabilities'
  | 'presets'
  | 'models3d'
  | 'remix'
  | 'scheduler'
  | 'skills-pro'
  | 'unknown';
