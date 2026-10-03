import {
  getMediaGenerationCreditFloor,
  getToolsForSurface,
  MEDIA_GENERATION_TOOL_NAME,
} from '@genfeedai/actions';

const BASE_AGENT_CREDIT_COSTS: Record<string, number> = Object.fromEntries(
  getToolsForSurface('agent').map((tool) => [tool.name, tool.creditCost]),
);

/**
 * Deliberate overrides of a curated catalog price. Keep this list to genuine
 * divergences: an entry that merely repeats the catalog cost becomes a second
 * source of truth that outranks review the moment the catalog changes.
 *
 * `create_post` costs 1 in the catalog because MCP charges for the publish;
 * the in-app agent tool only returns a draft or a confirmation card, and the
 * publish itself is billed downstream.
 */
const EXTRA_AGENT_CREDIT_COSTS: Record<string, number> = {
  create_post: 0,
};

export const AGENT_CREDIT_COSTS: Record<string, number> = {
  ...BASE_AGENT_CREDIT_COSTS,
  ...EXTRA_AGENT_CREDIT_COSTS,
};

/**
 * Minimum credits one call can charge. `generate` floors by `type` (a video
 * call must not pass the cheaper music gate); every other tool uses its
 * catalog price.
 */
export function agentToolCreditFloor(
  toolName: string,
  parameters: Record<string, unknown>,
): number {
  if (toolName === MEDIA_GENERATION_TOOL_NAME) {
    return getMediaGenerationCreditFloor(parameters);
  }
  return AGENT_CREDIT_COSTS[toolName] ?? 0;
}

/**
 * LLM request/response pairs inside one chat turn. 5 starved research turns
 * (brand context, knowledge ingest, onboarding) that need a handful of tools
 * before they can answer. Billing is still per completed round.
 */
export const AGENT_MAX_TOOL_ROUNDS = 25;

/**
 * Per-model LLM round costs and turn estimates live on
 * `AgentChatModelRegistryService` (DB registry). Do not reintroduce a static
 * map here — it dual-sources pricing against seed constants.
 */
