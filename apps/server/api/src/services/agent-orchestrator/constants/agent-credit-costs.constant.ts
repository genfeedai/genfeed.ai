import {
  AGENT_CHAT_MODELS,
  getAgentChatModelRoundCredits,
} from '@genfeedai/constants';
import { AgentToolName } from '@genfeedai/interfaces';
import { getToolsForSurface } from '@genfeedai/tools';

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
 * Credits burned by one LLM round, per model. Derived from the canonical
 * catalogue in `@genfeedai/constants` — a hand-maintained copy here drifted
 * from real provider pricing and billed frontier models at bargain rates.
 *
 * Served to the client by `GET /agent/credits` so the picker can price a turn
 * before it runs.
 */
export const AGENT_MODEL_ROUND_COSTS: Record<string, number> =
  Object.fromEntries(
    AGENT_CHAT_MODELS.map((model) => [model.key, model.creditCostPerRound]),
  );

/**
 * Credits to hold before a turn starts.
 *
 * Billing is per round against the model that actually answered, and a turn
 * runs 1..AGENT_MAX_TOOL_ROUNDS of them — so this is only the affordability
 * gate for the first round. Reserving the worst case upfront would lock out
 * organizations that can comfortably afford the single-round turns they
 * actually run; the loop stops as soon as the balance runs dry.
 */
export function getAgentTurnCreditEstimate(model: string): number {
  return getAgentChatModelRoundCredits(model);
}
