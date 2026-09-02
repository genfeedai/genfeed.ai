import {
  classifyAgentRunFailure,
  readAgentRunPublicError,
} from '@api/services/agent-orchestrator/utils/agent-run-failure.util';
import { describe, expect, it } from 'vitest';

describe('agent-run-failure.util', () => {
  it('reads a public error string from Error, string, or unknown values', () => {
    expect(readAgentRunPublicError(new Error('boom'))).toBe('boom');
    expect(readAgentRunPublicError('disk full')).toBe('disk full');
    expect(readAgentRunPublicError(12)).toBe('Unknown error');
  });

  it('classifies insufficient-credit failures without leaking raw dumps', () => {
    const classified = classifyAgentRunFailure(
      new Error('Not enough credits to finish this run'),
    );

    expect(classified).toContain('Not enough credits');
    expect(classified.toLowerCase()).not.toContain('stack');
  });
});
