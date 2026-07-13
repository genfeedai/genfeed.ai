import { DEFAULT_AGENT_CHAT_MODEL } from '@api/services/agent-orchestrator/constants/agent-default-model.constant';
import type { AgentChatRequest } from '@api/services/agent-orchestrator/interfaces/agent-chat.interface';
import type { OpenRouterPlugin } from '@api/services/integrations/openrouter/dto/openrouter.dto';

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

export type AgentRoutingPolicyReason =
  | 'default'
  | 'explicit-web-search'
  | 'fresh-live-data';

export interface AgentRoutingPolicy {
  plugins?: OpenRouterPlugin[];
  reason: AgentRoutingPolicyReason;
}

export function resolveAgentRoutingPolicy(params: {
  model: string;
  prompt: string;
  source?: AgentChatRequest['source'];
}): AgentRoutingPolicy {
  if (
    params.model !== DEFAULT_AGENT_CHAT_MODEL ||
    params.source === 'onboarding'
  ) {
    return { reason: 'default' };
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
  model: string;
  prompt: string;
  source?: AgentChatRequest['source'];
}): Partial<{
  routingPolicy: AgentRoutingPolicyReason;
  webSearchEnabled: boolean;
}> {
  const policy = resolveAgentRoutingPolicy(params);

  return policy.reason === 'default'
    ? {}
    : { routingPolicy: policy.reason, webSearchEnabled: true };
}
