/**
 * Capability tier for one agent chat turn (#4865, epic #4863).
 *
 * This is the only thing the typed decision is allowed to answer for auto
 * routing: the registry maps a tier onto a concrete model row. Model names,
 * registry keys and catalog rows are never choice options (epic FR 6), so the
 * catalog can change under the decision without retraining or re-labelling it.
 */
export enum AgentChatRoutingTier {
  /** Short factual replies, acknowledgements, trivial rewrites. */
  SIMPLE = 'simple',
  /** The everyday turn: drafting, light tool use, ordinary reasoning. */
  STANDARD = 'standard',
  /** Multi-step planning, long-context synthesis, hard reasoning. */
  COMPLEX = 'complex',
}

/** Bounded option list handed to `TypedDecisionService.choose`. */
export const AGENT_CHAT_ROUTING_TIERS = [
  AgentChatRoutingTier.SIMPLE,
  AgentChatRoutingTier.STANDARD,
  AgentChatRoutingTier.COMPLEX,
] as const satisfies readonly AgentChatRoutingTier[];
