import { agentRunAttributes } from '@serializers/attributes/threads/agent-run.attributes';
import { agentThreadAttributes } from '@serializers/attributes/threads/agent-thread.attributes';
import { describe, expect, it } from 'vitest';

describe('agent run projection serialization', () => {
  it('exposes FR-1 runtime state and decision deep-link fields', () => {
    expect(agentRunAttributes).toEqual(
      expect.arrayContaining([
        'decisionHref',
        'isProjectionStale',
        'projectedAt',
        'runtimeState',
        'threadId',
      ]),
    );
  });

  it('keeps the thread list projection aligned with the runs surface', () => {
    expect(agentThreadAttributes).toEqual(
      expect.arrayContaining(['runtimeState', 'decisionHref', 'runStatus']),
    );
  });
});
