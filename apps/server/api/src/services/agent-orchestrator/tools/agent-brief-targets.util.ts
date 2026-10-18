import type { AgentRunBriefTargets } from '@api/services/agent-orchestrator/interfaces/agent-chat.interface';
import type { CuratedActionName } from '@genfeedai/actions';
import type { AgentToolResult } from '@genfeedai/contracts/interfaces';

/** Generation tools that take a platform list and an optional topic list. */
const BATCH_TARGET_TOOLS = new Set<string>([
  'generate_monthly_content',
  'generate_turbo_content',
]);

const LONG_FORM_CONTENT_TYPES = new Set(['article', 'newsletter', 'x-article']);

export type AgentBriefTargetResolution =
  | { parameters: Record<string, unknown> }
  | { refusal: AgentToolResult };

function readStrings(value: unknown): string[] {
  if (typeof value === 'string' && value.trim()) return [value.trim()];
  return Array.isArray(value)
    ? value.filter(
        (item): item is string => typeof item === 'string' && !!item.trim(),
      )
    : [];
}

function normalize(platform: string): string {
  const value = platform.trim().toLowerCase();
  return value === 'x' ? 'twitter' : value;
}

function constrainPlatforms(
  requested: unknown,
  configured: string[],
): string[] {
  const allowed = new Set(configured.map(normalize));
  const kept = readStrings(requested).filter((platform) =>
    allowed.has(normalize(platform)),
  );
  return kept.length > 0 ? kept : configured;
}

function isSocialContentCall(parameters: Record<string, unknown>): boolean {
  const type = String(parameters.type || parameters.contentType || '')
    .trim()
    .toLowerCase();
  return !LONG_FORM_CONTENT_TYPES.has(type) && parameters.longForm !== true;
}

/**
 * Pins a proactive run's generation calls to the agent's configured platforms
 * and topics. A missing or unconfigured platform is replaced by a configured
 * one, a missing topic list takes the configured topics, and an agent with no
 * configured platform generates nothing instead of falling back to a tool's
 * default network.
 */
export function applyAgentBriefTargets(
  toolName: CuratedActionName,
  parameters: Record<string, unknown>,
  brief: AgentRunBriefTargets,
): AgentBriefTargetResolution {
  const isBatch = BATCH_TARGET_TOOLS.has(toolName);
  const isSocial =
    toolName === 'generate_content' && isSocialContentCall(parameters);
  if (!isBatch && !isSocial) return { parameters };
  if (brief.platforms.length === 0) {
    return {
      refusal: {
        creditsUsed: 0,
        error:
          'This agent has no platforms configured. Ask for its platforms before generating.',
        success: false,
      },
    };
  }
  if (isBatch) {
    const topics = readStrings(parameters.topics);
    return {
      parameters: {
        ...parameters,
        platforms: constrainPlatforms(parameters.platforms, brief.platforms),
        ...(toolName === 'generate_turbo_content' &&
        topics.length === 0 &&
        brief.topics.length > 0
          ? { topics: brief.topics }
          : {}),
      },
    };
  }
  const topic =
    typeof parameters.topic === 'string' ? parameters.topic.trim() : '';
  return {
    parameters: {
      ...parameters,
      platform: constrainPlatforms(parameters.platform, brief.platforms)[0],
      ...(!topic && brief.topics.length > 0 ? { topic: brief.topics[0] } : {}),
    },
  };
}
