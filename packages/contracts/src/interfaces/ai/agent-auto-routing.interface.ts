import type { AgentChatRoutingTier, RouterPriority } from '../..';
import type { TypedDecisionMode } from './typed-decision.interface';

/**
 * Agent auto-routing via typed decisions (#4865, epic #4863).
 *
 * `openrouter/auto` hands model choice to the gateway's auto-router plugin.
 * These types describe Genfeed's own answer to the same question: a capability
 * tier the registry maps onto a concrete key, plus whether the turn needs live
 * web data. Both are advisory — every field is optional precisely so that a
 * provider failure, a sub-threshold confidence or `off` mode leaves the caller
 * on today's deterministic path.
 */

/** Turn state judged by the tier and web-search decisions. Data, never instructions. */
export interface AgentAutoRoutingState {
  /** Tools are offered to the model this round. */
  hasToolsAvailable: boolean;
  /** The round before this one answered with tool calls. */
  hasPreviousRoundUsedTools: boolean;
  /** Latest user message, truncated by the resolver before it leaves the app. */
  latestUserMessage: string;
  /** Router priority the turn was requested with. */
  prioritize?: RouterPriority;
  /** 1-based tool-calling round inside the turn. */
  roundNumber: number;
}

/**
 * What the resolver concluded for one round.
 *
 * `dispatchModelKey` and `isWebSearchNeeded` are the only two fields a caller
 * may act on, and both are set only in `live` mode above threshold with the
 * key still auto-allowed. Everything else exists so the thread and the logs
 * can show what the decision said in `shadow`.
 */
export interface AgentAutoRoutingResolution {
  /** The key the tier mapped to, in `shadow` as well as `live`. Never dispatched on its own. */
  candidateModelKey?: string;
  /** Dispatch this instead of the gateway auto-router. Live and confident only. */
  dispatchModelKey?: string;
  /** Replaces the keyword outcome for the web plugin. Live and confident only. */
  isWebSearchNeeded?: boolean;
  mode: TypedDecisionMode;
  tier?: AgentChatRoutingTier;
  /** Calibrated 0..1 confidence behind `tier`. */
  tierConfidence?: number;
}

/** Thread metadata written for a routed turn, alongside the policy reason. */
export interface AgentAutoRoutingMetadata {
  /**
   * The key the round ran on: the dispatched key in `live`, the tier's
   * candidate in `shadow`. Absent when the gateway auto-router handled it.
   */
  routedModelKey?: string;
  routingDecisionMode?: TypedDecisionMode;
  routingTier?: AgentChatRoutingTier;
  routingTierConfidence?: number;
}
