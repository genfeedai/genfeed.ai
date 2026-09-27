import type { AgentStrategyDocument } from '@api/collections/agent-strategies/schemas/agent-strategy.schema';
import type { AgentType } from '@genfeedai/contracts';

/**
 * Pure strategy/campaign parsing helpers for `ContentEngineService`.
 * Extracted from the service class (none of these touch `this`) to keep the
 * service file from growing past its runtime-complexity ratchet baseline.
 */

export function requireAgentType(
  agentType: AgentStrategyDocument['agentType'],
): AgentType {
  if (!agentType) {
    throw new Error('Agent strategy type is missing');
  }

  return agentType as AgentType;
}

export function normalizeModel(
  model: string | null | undefined,
): string | undefined {
  return model ?? undefined;
}

export function normalizeDate(value: unknown): Date | null {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value;
  }

  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  return null;
}

export function getStrategyTopics(strategy: AgentStrategyDocument): string[] {
  return strategy.topics ?? [];
}

export function getStrategyPlatforms(
  strategy: AgentStrategyDocument,
): string[] {
  return strategy.platforms ?? [];
}
