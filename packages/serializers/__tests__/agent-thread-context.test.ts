import { agentThreadAttributes } from '@serializers/attributes/threads/agent-thread.attributes';
import { describe, expect, it } from 'vitest';

describe('agent thread context serialization', () => {
  it('exposes the authoritative brand and shell context version', () => {
    expect(agentThreadAttributes).toEqual(
      expect.arrayContaining(['brandId', 'contextVersion', 'organizationId']),
    );
  });
});
