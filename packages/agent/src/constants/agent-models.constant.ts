import { SELECTABLE_AGENT_CHAT_MODELS } from '@genfeedai/constants';
import type { CostTier } from '@genfeedai/enums';

export interface AgentModelOption {
  key: string;
  label: string;
  description: string;
  creditCost?: number;
  costTier?: CostTier;
  brandSlug: string;
  isReasoning?: boolean;
}

/**
 * Models offered in the agent picker.
 *
 * Derived from the canonical catalogue in `@genfeedai/constants` so labels,
 * credit costs and cost tiers can never drift from what the API bills. The
 * "Auto" entry is gone on purpose: OpenRouter picked any model at any price
 * while we charged the cheapest tier for it.
 */
export const AGENT_MODELS: AgentModelOption[] =
  SELECTABLE_AGENT_CHAT_MODELS.map((model) => ({
    brandSlug: model.brandSlug,
    costTier: model.costTier,
    creditCost: model.creditCostPerRound,
    description: model.description,
    ...(model.isReasoning ? { isReasoning: true } : {}),
    key: model.key,
    label: model.label,
  }));

export function getAgentModelByKey(key: string): AgentModelOption | undefined {
  return AGENT_MODELS.find((m) => m.key === key);
}
