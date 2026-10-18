import { mockFetch, mockOk } from '@agent-tests/json-api-fetch.mock';
import { resolveReviewInboxItem } from '@genfeedai/agent/services/agent-api/agent-api.review-inbox';
import { AgentBaseApiService } from '@genfeedai/agent/services/agent-base-api.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

function makeApi(): AgentBaseApiService {
  return new AgentBaseApiService({
    baseUrl: 'http://api.test',
    getToken: vi.fn().mockResolvedValue('test-token'),
  });
}

describe('resolveReviewInboxItem', () => {
  beforeEach(() => mockFetch.mockReset());

  it('posts one decision to the review inbox and decodes the result', async () => {
    mockOk({
      data: {
        attributes: {
          decision: 'approve',
          itemId: 'mcp_approval:apr-1',
          kind: 'mcp_approval',
          resolvedAt: '2026-10-01T00:00:00.000Z',
          status: 'approved',
        },
        id: 'mcp_approval:apr-1',
        type: 'review-inbox-decision',
      },
    });

    const result = await resolveReviewInboxItem(
      makeApi(),
      'mcp_approval:apr-1',
      'approve',
    );

    expect(result).toMatchObject({
      itemId: 'mcp_approval:apr-1',
      status: 'approved',
    });
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://api.test/review-inbox/decisions');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({
      decision: 'approve',
      itemId: 'mcp_approval:apr-1',
    });
  });
});
