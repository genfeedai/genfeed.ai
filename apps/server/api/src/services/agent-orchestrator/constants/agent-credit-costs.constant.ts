import { BRAND_PROFILE_GENERATION_CREDIT_COST } from '@api/collections/brands/constants/brand-profile.constant';
import { AgentToolName } from '@genfeedai/interfaces';
import { getToolsForSurface } from '@genfeedai/tools';

const BASE_AGENT_CREDIT_COSTS: Record<string, number> = Object.fromEntries(
  getToolsForSurface('agent').map((tool) => [tool.name, tool.creditCost]),
);

const EXTRA_AGENT_CREDIT_COSTS: Record<string, number> = {
  [AgentToolName.CAPTURE_MEMORY]: 0,
  [AgentToolName.CREATE_LIVESTREAM_BOT]: 0,
  [AgentToolName.CREATE_POST]: 0,
  [AgentToolName.DRAFT_BRAND_VOICE_PROFILE]:
    BRAND_PROFILE_GENERATION_CREDIT_COST,
  [AgentToolName.GENERATE_AD_PACK]: 0,
  [AgentToolName.GET_TOP_INGREDIENTS]: 0,
  [AgentToolName.MANAGE_LIVESTREAM_BOT]: 0,
  [AgentToolName.PREPARE_AD_LAUNCH_REVIEW]: 0,
  [AgentToolName.RATE_CONTENT]: 0,
  [AgentToolName.RATE_INGREDIENT]: 0,
  [AgentToolName.REPLICATE_TOP_INGREDIENT]: 0,
};

export const AGENT_CREDIT_COSTS: Record<string, number> = {
  ...BASE_AGENT_CREDIT_COSTS,
  ...EXTRA_AGENT_CREDIT_COSTS,
};

export const AGENT_BASE_TURN_COST = 1;
export const AGENT_MAX_TOOL_ROUNDS = 5;

/**
 * Per-model agent turn costs based on provider pricing + 70% margin.
 * Estimated per-turn: ~10K input + 2K output tokens, 2 LLM rounds avg.
 * 1 credit = $0.01
 *
 * local/* models run on self-hosted EC2 (platform cost, not per-user).
 */
export const AGENT_MODEL_TURN_COSTS: Record<string, number> = {
  'anthropic/claude-opus-4-6': 15,
  'anthropic/claude-sonnet-4-5-20250929': 10,
  'deepseek/deepseek-chat': 1,
  'google/gemini-3-flash-preview': 4,
  'local/mistral-small': 0,
  'local/qwen-32b': 0,
  'openai/gpt-4o': 8,
  'openai/o3': 15,
  'openai/o4-mini': 3,
  'openrouter/auto': 1,
  'x-ai/grok-4-fast': 1,
};

export function getAgentTurnCost(model: string): number {
  return AGENT_MODEL_TURN_COSTS[model] ?? AGENT_BASE_TURN_COST;
}
