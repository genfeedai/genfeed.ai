import { getToolsForSurface } from '@genfeedai/actions';
import { AgentToolName } from '@genfeedai/contracts/interfaces';

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
  [AgentToolName.CREATE_POST]: 0,
};

export const AGENT_CREDIT_COSTS: Record<string, number> = {
  ...BASE_AGENT_CREDIT_COSTS,
  ...EXTRA_AGENT_CREDIT_COSTS,
};

export const AGENT_MAX_TOOL_ROUNDS = 5;

/**
 * Per-model LLM round costs and turn estimates live on
 * `AgentChatModelRegistryService` (DB registry). Do not reintroduce a static
 * map here — it dual-sources pricing against seed constants.
 */
