import { AgentClient } from '@mcp/services/client/agent.client';
import type { BaseApiClient } from '@mcp/services/client/base-api-client';
import { describe, expect, it, vi } from 'vitest';

function build() {
  const post = vi.fn().mockResolvedValue({
    data: {
      data: { id: 'approval/1', status: 'PENDING', toolName: 'generate' },
    },
  });
  const get = vi.fn();
  const client = new AgentClient({
    request: async (
      _operation: string,
      call: (http: unknown) => Promise<unknown>,
    ) => call({ post, get }),
    failWithDetail: vi.fn(),
    unwrapAttributes: (response: {
      data: { data: { attributes: Record<string, unknown> } };
    }) => response.data.data.attributes,
  } as unknown as BaseApiClient);
  return { client, post, get };
}

describe('MCP approval server-prepared price', () => {
  it.each([0, 2, 64])(
    'uses the persisted %i-credit quote rather than caller estimates',
    async (credits) => {
      const { client, get } = build();
      get.mockResolvedValue({
        data: {
          data: {
            attributes: {
              estimatedCredits: credits,
              modelKey: 'selected-model',
              quoteStatus: 'available',
            },
          },
        },
      });
      const approval = await client.createApproval('generate', {
        type: 'video',
        estimatedCredits: 999,
        maximumCredits: 999,
      });
      expect(get).toHaveBeenCalledExactlyOnceWith(
        '/mcp-approvals/approval%2F1/pricing',
      );
      expect(approval.generationQuote).toEqual({
        credits,
        isAvailable: true,
        modelKey: 'selected-model',
      });
    },
  );

  it('keeps an unavailable quote unknown instead of inventing zero', async () => {
    const { client, get } = build();
    get.mockResolvedValue({
      data: {
        data: {
          attributes: {
            estimatedCredits: null,
            modelKey: null,
            quoteStatus: 'unavailable',
          },
        },
      },
    });
    expect(
      (await client.createApproval('generate', { type: 'image' }))
        .generationQuote,
    ).toEqual({ credits: null, isAvailable: false, modelKey: null });
  });

  it('propagates a denied pricing lookup without falling back to a floor', async () => {
    const { client, get } = build();
    const denied = new Error('Forbidden');
    get.mockRejectedValue(denied);
    await expect(
      client.createApproval('generate', { type: 'image' }),
    ).rejects.toBe(denied);
  });

  it('preserves other approvals without an extra pricing request', async () => {
    const { client, get } = build();
    await client.createApproval('create_post', { content: 'Draft' });
    expect(get).not.toHaveBeenCalled();
  });
});
