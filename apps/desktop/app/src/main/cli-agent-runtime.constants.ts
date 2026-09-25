import {
  AGENT_EXTERNAL_RUNTIME_KEYS,
  type AgentExternalRuntimeKey,
} from '@genfeedai/contracts/constants/agent-external-runtime.constant';

/** MCP server name the CLIs see; Claude exposes tools as `mcp__genfeed__*`. */
export const GENFEED_MCP_SERVER_NAME = 'genfeed';

/** Env var that carries the `gf_` key to Codex (never written to disk). */
export const GENFEED_MCP_TOKEN_ENV_VAR = 'GENFEED_API_KEY';

/** First tool the agent must call in a new thread (curated MCP action). */
export const GENFEED_BRAND_CONTEXT_TOOL = 'get_brand_context';

export const DESKTOP_CLI_AGENT_TURN_TIMEOUT_MS = 15 * 60_000;
export const DESKTOP_CLI_AGENT_IDLE_TIMEOUT_MS = 5 * 60_000;
export const DESKTOP_CLI_AGENT_KILL_GRACE_MS = 3_000;
export const DESKTOP_CLI_AGENT_MAX_PROMPT_LENGTH = 100_000;

export type DesktopCliAgentProvider = 'claude' | 'codex';

export interface DesktopCliAgentRuntimeDefinition {
  command: string;
  installCommand: string;
  label: string;
  loginCommand: string;
  provider: DesktopCliAgentProvider;
}

export const DESKTOP_CLI_AGENT_RUNTIMES: Record<
  AgentExternalRuntimeKey,
  DesktopCliAgentRuntimeDefinition
> = {
  [AGENT_EXTERNAL_RUNTIME_KEYS.CLAUDE_CLI]: {
    command: 'claude',
    installCommand: 'npm install -g @anthropic-ai/claude-code',
    label: 'Claude Code',
    loginCommand: 'claude auth login',
    provider: 'claude',
  },
  [AGENT_EXTERNAL_RUNTIME_KEYS.CODEX_CLI]: {
    command: 'codex',
    installCommand: 'npm install -g @openai/codex',
    label: 'Codex',
    loginCommand: 'codex login',
    provider: 'codex',
  },
};

export interface DesktopCliAgentPromptContext {
  brandId: string | null;
  organizationId: string | null;
  runtimeLabel: string;
  threadId: string;
}

/**
 * Appended to the CLI's own system prompt (Claude) or sent ahead of the first
 * message of a thread (Codex). Genfeed stays the source of truth: the CLI is
 * only the model and must reach brand context, memory, and every product
 * action through the Genfeed MCP server.
 */
export function buildDesktopCliAgentSystemPrompt(
  context: DesktopCliAgentPromptContext,
): string {
  const brandLine = context.brandId
    ? `Active Genfeed brand id: ${context.brandId}`
    : 'No Genfeed brand is selected for this thread. Ask the user which brand to work on (the genfeed MCP tools can list brands) before writing brand content.';

  return [
    `You are the Genfeed agent. You run inside Genfeed Desktop on the user's own ${context.runtimeLabel} subscription, but the user's work lives in Genfeed.`,
    '',
    `Genfeed organization id: ${context.organizationId ?? 'unknown'}`,
    brandLine,
    `Genfeed thread id: ${context.threadId}`,
    '',
    'Rules:',
    `1. At the start of a new conversation, and whenever the brand changes, call the \`${GENFEED_BRAND_CONTEXT_TOOL}\` tool on the \`${GENFEED_MCP_SERVER_NAME}\` MCP server for the active brand before drafting anything. It returns the brand voice, knowledge, and memory you must follow.`,
    `2. Use the \`${GENFEED_MCP_SERVER_NAME}\` MCP tools for every Genfeed action (content, media generation, scheduling, publishing, knowledge, memory). Never claim an action happened unless a genfeed tool confirmed it.`,
    '3. You have no access to files or shell commands on this computer in this conversation. Do not ask for them.',
    "4. Your own replies run on the user's subscription and cost no Genfeed credits, but Genfeed tools that generate media or publish still spend Genfeed credits. Say so before calling them.",
    '5. Reply in concise Markdown.',
  ].join('\n');
}
