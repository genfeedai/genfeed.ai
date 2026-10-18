import { describe, expect, it } from 'vitest';
import common from './en/common.json';

/** Words that once named the agent object itself. */
const RETIRED_AGENT_NAME = /\b(autopilot|strateg(y|ies)|policy label)\b/i;

function collectLeaves(
  value: unknown,
  path: string,
): Array<{ path: string; value: string }> {
  if (typeof value === 'string') {
    return [{ path, value }];
  }

  if (!value || typeof value !== 'object') {
    return [];
  }

  return Object.entries(value).flatMap(([key, child]) =>
    collectLeaves(child, path ? `${path}.${key}` : key),
  );
}

describe('Agent terminology catalogs', () => {
  it('calls the agent object an Agent on every agent surface', () => {
    const { agentCreation, agentDetail, agentHub } = common.automation;
    const retired = [
      ...collectLeaves(agentCreation, 'agentCreation'),
      ...collectLeaves(agentDetail, 'agentDetail'),
      ...collectLeaves(agentHub, 'agentHub'),
    ].filter((entry) => RETIRED_AGENT_NAME.test(entry.value));

    expect(retired).toEqual([]);
  });

  it('names the agent edit action as Agent', () => {
    const { agentHub } = common.automation;

    expect(agentHub.edit).toBe('Edit agent');
    expect(Object.values(agentHub)).not.toContain('Schedule');
  });
});
