import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BaseApiClient } from './base-api-client';
import { WorkspaceClient } from './workspace.client';

describe('approval-waiting job status (#6595)', () => {
  const get = vi.fn();
  const client = new WorkspaceClient({
    request: async (
      _operation: string,
      call: (http: unknown) => Promise<unknown>,
    ) => call({ get }),
    failWith: vi.fn(),
    failWithDetail: vi.fn(),
    unwrapAttributes: (response: { data: { data: Record<string, unknown> } }) =>
      response.data.data.attributes ?? response.data.data,
  } as unknown as BaseApiClient);

  beforeEach(() => vi.resetAllMocks());

  it('reads a minimal approval status after an empty ingredient result', async () => {
    get.mockResolvedValueOnce({ data: { data: [] } }).mockResolvedValueOnce({
      data: {
        data: { id: 'approval/1', status: 'PENDING', toolName: 'generate' },
      },
    });
    expect(await client.getJobStatus('approval/1')).toEqual({
      id: 'approval/1',
      status: 'PENDING',
      toolName: 'generate',
    });
    expect(get).toHaveBeenLastCalledWith('/mcp-approvals/approval%2F1/status');
  });

  it('allows an ingredient 404 to look up approval status', async () => {
    get
      .mockRejectedValueOnce({ response: { status: 404 } })
      .mockResolvedValueOnce({
        data: { data: { id: 'approval-1', status: 'DECLINED' } },
      });
    expect(await client.getJobStatus('approval-1')).toMatchObject({
      status: 'DECLINED',
    });
  });

  it.each([401, 403, 429, 500])(
    'never falls back after HTTP %s',
    async (status) => {
      const error = { response: { status } };
      get.mockRejectedValueOnce(error);
      await expect(client.getJobStatus('approval-1')).rejects.toBe(error);
      expect(get).toHaveBeenCalledTimes(1);
    },
  );

  it('does not return an unrelated ingredient as the requested job', async () => {
    get.mockResolvedValueOnce({
      data: { data: [{ id: 'other', attributes: { status: 'GENERATED' } }] },
    });
    await expect(client.getJobStatus('approval-1')).rejects.toThrow();
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('does not fetch approvals for an existing ingredient', async () => {
    get.mockResolvedValueOnce({
      data: {
        data: [
          {
            id: 'video-1',
            attributes: { status: 'PROCESSING', generationProgress: 42 },
          },
        ],
      },
    });
    expect(await client.getJobStatus('video-1')).toMatchObject({
      id: 'video-1',
      progress: 42,
    });
    expect(get).toHaveBeenCalledTimes(1);
  });
});
