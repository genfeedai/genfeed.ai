/**
 * Process-scoped **agent chat** margin multiplier (#5172).
 *
 * Before #5172, `AgentChatModelRegistryService.toRoundCredits` read the
 * generation runtime multiplier (`getRuntimeMarginMultiplier`) as an extra
 * factor on top of the hardcoded `AGENT_CREDIT_MARGIN_MULTIPLIER` constant —
 * so an operator editing the single admin knob silently repriced generation
 * *and* agent chat together, with no way to tell which one they were moving.
 * This file gives agent chat its own runtime multiplier, hydrated from
 * `PlatformSetting.marginMultiplierAgentChat`, completely independent of
 * generation's `PlatformSetting.marginMultiplierGeneration`.
 */

import { AGENT_CREDIT_MARGIN_MULTIPLIER } from '@genfeedai/contracts/constants';

import { normalizeMarginMultiplier } from './plans-pricing';

/** Default sell/cost ratio for agent chat until an operator overrides it. */
export const DEFAULT_AGENT_CHAT_MARGIN_MULTIPLIER =
  AGENT_CREDIT_MARGIN_MULTIPLIER;

let runtimeAgentChatMarginMultiplier = DEFAULT_AGENT_CHAT_MARGIN_MULTIPLIER;

/**
 * Set the process-scoped agent-chat margin multiplier. Non-finite or
 * non-positive values fall back to the default so a misconfigured knob can
 * never zero out agent-chat pricing.
 */
export function setRuntimeAgentChatMarginMultiplier(multiplier: number): void {
  runtimeAgentChatMarginMultiplier = normalizeMarginMultiplier(
    multiplier,
    DEFAULT_AGENT_CHAT_MARGIN_MULTIPLIER,
  );
}

/** Read the current process-scoped agent-chat margin multiplier. */
export function getRuntimeAgentChatMarginMultiplier(): number {
  return runtimeAgentChatMarginMultiplier;
}
