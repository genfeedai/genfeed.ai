import type { AgentToolCallSummary } from '@genfeedai/agent/models/agent-chat.model';
import { describe, expect, it, vi } from 'vitest';
import { mapToolCallResponse } from './map-tool-call-response';

describe('mapToolCallResponse', () => {
  it('maps summary fields and prefixes a generated id', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);

    const summary: AgentToolCallSummary = {
      creditsUsed: 4,
      durationMs: 120,
      error: 'timeout',
      parameters: { query: 'launch' },
      resultSummary: '3 posts',
      status: 'failed',
      toolName: 'list_posts',
    };

    expect(mapToolCallResponse(summary)).toEqual({
      arguments: { query: 'launch' },
      creditsUsed: 4,
      durationMs: 120,
      error: 'timeout',
      id: 'tc-1700000000000-list_posts',
      name: 'list_posts',
      parameters: { query: 'launch' },
      resultSummary: '3 posts',
      status: 'failed',
    });
  });

  it('defaults missing parameters to an empty object', () => {
    const mapped = mapToolCallResponse({
      creditsUsed: 0,
      durationMs: 1,
      status: 'completed',
      toolName: 'resolve_handle',
    });

    expect(mapped.arguments).toEqual({});
    expect(mapped.parameters).toBeUndefined();
    expect(mapped.id.startsWith('tc-')).toBe(true);
    expect(mapped.id.endsWith('-resolve_handle')).toBe(true);
  });
});
