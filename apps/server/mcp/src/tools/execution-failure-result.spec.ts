import { executionFailureResult } from '@mcp/tools/execution-failure-result';
import { describe, expect, it } from 'vitest';

describe('persisted execution failure result', () => {
  it('classifies failed runs while excluding raw credentials from classification', () => {
    expect(
      executionFailureResult({
        status: 'FAILED',
        error: 'HTTP 429 Bearer private-token',
      }),
    ).toMatchObject({
      isError: true,
      structuredContent: { failure: { reason: 'RATE_LIMITED', detail: null } },
    });
    expect(
      JSON.stringify(
        executionFailureResult({
          status: 'FAILED',
          error: 'password=private-token',
        }),
      ),
    ).not.toContain('private-token');
  });

  it.each([
    null,
    { content: 'failed', role: 'user' },
    { status: 'RUNNING' },
    { status: 'COMPLETED' },
  ])('does not flag accepted or nonfailed payloads %s', (payload) => {
    expect(executionFailureResult(payload)).toEqual({});
  });
});
