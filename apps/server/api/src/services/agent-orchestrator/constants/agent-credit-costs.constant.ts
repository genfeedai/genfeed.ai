import { getToolsForSurface } from '@genfeedai/tools';

const BASE_AGENT_CREDIT_COSTS: Record<string, number> = Object.fromEntries(
  getToolsForSurface('agent').map((tool) => [tool.name, tool.creditCost]),
);

const EXTRA_AGENT_CREDIT_COSTS: Record<string, number> = {
  capture_memory: 0,
  create_ad_remix_workflow: 0,
  create_livestream_bot: 0,
  create_post: 0,
  generate_ad_pack: 0,
  get_ad_research_detail: 0,
  get_top_ingredients: 0,
  list_ads_research: 0,
  manage_livestream_bot: 0,
  prepare_ad_launch_review: 0,
  rate_content: 0,
  rate_ingredient: 0,
  replicate_top_ingredient: 0,
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
