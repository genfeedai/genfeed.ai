import { AgentClient } from '@mcp/services/client/agent.client';
import type { BaseApiClient } from '@mcp/services/client/base-api-client';
import { describe, expect, it, vi } from 'vitest';

function build(call: () => Promise<unknown>) {
  const http = { get: vi.fn(call) };
  const base = {
    request: async (
      _operation: string,
      run: (client: typeof http) => Promise<boolean>,
      onError: (error: Error) => boolean,
    ) => {
      try {
        return await run(http);
      } catch (error: unknown) {
        return onError(error as Error);
      }
    },
  };
  return { client: new AgentClient(base as unknown as BaseApiClient), http };
}

describe('AgentClient.isApprovalRequired', () => {
  it('reads the effective policy from the API', async () => {
    const { client, http } = build(async () => ({
      data: { data: { isApprovalRequired: false } },
    }));

    await expect(client.isApprovalRequired()).resolves.toBe(false);
    expect(http.get).toHaveBeenCalledWith('/mcp-approvals/policy');
  });

  it('requires approval when the API says so', async () => {
    const { client } = build(async () => ({
      data: { data: { isApprovalRequired: true } },
    }));

    await expect(client.isApprovalRequired()).resolves.toBe(true);
  });

  it('requires approval when the lookup fails', async () => {
    const { client } = build(async () => {
      throw new Error('network');
    });

    await expect(client.isApprovalRequired()).resolves.toBe(true);
  });
});
