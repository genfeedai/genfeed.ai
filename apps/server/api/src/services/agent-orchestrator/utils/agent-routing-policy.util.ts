import type { AgentChatRequest } from '@api/services/agent-orchestrator/interfaces/agent-chat.interface';
import type { OpenRouterPlugin } from '@api/services/integrations/openrouter/dto/openrouter.dto';
import type {
  AgentAutoRoutingMetadata,
  AgentAutoRoutingResolution,
  AgentRoutingPolicy,
  AgentRoutingPolicyReason,
} from '@genfeedai/contracts/interfaces';

const EXPLICIT_WEB_SEARCH_PATTERN =
  /\b(browse|find online|google|internet|look up online|online research|search (?:the )?(?:internet|online|web)|web search)\b/i;
const LIVE_DATA_KEYWORDS = [
  'breaking',
  'current',
  'latest',
  'live data',
  'news today',
  'recent',
  'right now',
  'today',
  'up to date',
] as const;
const LIVE_DATA_TOPIC_KEYWORDS = [
  'algorithm',
  'announcement',
  'competitor',
  'creator economy',
  'market',
  'news',
  'pricing',
  'release',
  'trend',
  'trending',
  'update',
] as const;

export function resolveAgentRoutingPolicy(params: {
  /** Platform default model key (from registry `isDefault`). */
  defaultModelKey: string;
  /**
   * Typed decision's answer (#4865). Set only when the decision is live and
   * above threshold; `undefined` keeps the keyword outcome below, which stays
   * the `off`-mode behaviour and the fallback on every provider failure.
   */
  isWebSearchNeeded?: boolean;
  model: string;
  prompt: string;
  source?: AgentChatRequest['source'];
}): AgentRoutingPolicy {
  if (
    params.model !== params.defaultModelKey ||
    params.source === 'onboarding'
  ) {
    return { reason: 'default' };
  }

  if (params.isWebSearchNeeded !== undefined) {
    return params.isWebSearchNeeded
      ? { plugins: [{ id: 'web' }], reason: 'decided-live-data' }
      : { reason: 'default' };
  }

  if (EXPLICIT_WEB_SEARCH_PATTERN.test(params.prompt)) {
    return { plugins: [{ id: 'web' }], reason: 'explicit-web-search' };
  }

  const normalizedPrompt = params.prompt.toLowerCase();
  const hasFreshnessCue = LIVE_DATA_KEYWORDS.some((keyword) =>
    normalizedPrompt.includes(keyword),
  );
  const hasLiveDataTopic = LIVE_DATA_TOPIC_KEYWORDS.some((keyword) =>
    normalizedPrompt.includes(keyword),
  );

  return hasFreshnessCue && hasLiveDataTopic
    ? { plugins: [{ id: 'web' }], reason: 'fresh-live-data' }
    : { reason: 'default' };
}

export function resolveAgentRoutingPlugins(
  policy: AgentRoutingPolicy,
): OpenRouterPlugin[] | undefined {
  return policy.reason === 'default' ? undefined : policy.plugins;
}

export function buildAgentRoutingMetadata(params: {
  /** What the auto-routing decision concluded for the turn's last round. */
  autoRouting?: AgentAutoRoutingResolution;
  defaultModelKey: string;
  model: string;
  prompt: string;
  source?: AgentChatRequest['source'];
}): Partial<
  AgentAutoRoutingMetadata & {
    routingPolicy: AgentRoutingPolicyReason;
    webSearchEnabled: boolean;
  }
> {
  const policy = resolveAgentRoutingPolicy({
    defaultModelKey: params.defaultModelKey,
    isWebSearchNeeded: params.autoRouting?.isWebSearchNeeded,
    model: params.model,
    prompt: params.prompt,
    source: params.source,
  });
  const autoRouting = params.autoRouting;

  return {
    ...(policy.reason === 'default'
      ? {}
      : { routingPolicy: policy.reason, webSearchEnabled: true }),
    // `routedModelKey` is the key the tier mapped to. In shadow mode nothing
    // was dispatched on it — `routingDecisionMode` is what says so.
    ...(autoRouting?.candidateModelKey === undefined
      ? {}
      : { routedModelKey: autoRouting.candidateModelKey }),
    ...(autoRouting === undefined || autoRouting.mode === 'off'
      ? {}
      : { routingDecisionMode: autoRouting.mode }),
    ...(autoRouting?.tier === undefined
      ? {}
      : { routingTier: autoRouting.tier }),
    ...(autoRouting?.tierConfidence === undefined
      ? {}
      : { routingTierConfidence: autoRouting.tierConfidence }),
  };
}
