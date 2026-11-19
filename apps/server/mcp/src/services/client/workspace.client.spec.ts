import { toMcpToolErrorResult } from '@mcp/tools/mcp-tool-error';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BaseApiClient } from './base-api-client';
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

describe('organization listing', () => {
  const get = vi.fn();
  const logger = { debug: vi.fn(), error: vi.fn(), warn: vi.fn() };
  const client = new WorkspaceClient(
    new BaseApiClient(
      logger as never,
      { axiosRef: { create: () => ({ get }) } } as never,
      { get: () => undefined } as never,
    ),
  );

  beforeEach(() => vi.resetAllMocks());

  it('reads the caller memberships from the cross-organization list', async () => {
    const organizations = [
      { id: 'org-a', isActive: true, label: 'Acme' },
      { id: 'org-b', isActive: false, label: 'Beta' },
    ];
    get.mockResolvedValueOnce({ data: organizations });

    expect(await client.listOrganizations()).toEqual(organizations);
    expect(get).toHaveBeenCalledWith('/organizations', {
      params: { mine: true },
    });
  });

  it('returns a valid empty organization list', async () => {
    get.mockResolvedValueOnce({ data: { data: [] } });

    await expect(client.listOrganizations()).resolves.toEqual([]);
  });

  it('reports an unexpected response as a lookup failure', async () => {
    get.mockResolvedValueOnce({ data: { errors: [] } });

    await expect(client.listOrganizations()).rejects.toThrow(
      'Could not load your organizations. Try get_orgs again',
    );
  });

  it.each([
    [401, 'Reconnect Genfeed'],
    [403, 'check your organization access'],
    [502, 'Try get_orgs again'],
  ])(
    'gives recovery guidance for HTTP %s without upstream details',
    async (status, guidance) => {
      get.mockRejectedValueOnce({
        message: 'private account information',
        response: {
          data: { errors: [{ detail: 'private account information' }] },
          status,
        },
      });

      await expect(client.listOrganizations()).rejects.toMatchObject({
        body: undefined,
        message: expect.stringContaining(guidance),
        status,
      });
      expect(
        JSON.stringify([logger.error.mock.calls, logger.warn.mock.calls]),
      ).not.toContain('private account information');
    },
  );

  it('returns the retry delay when organization discovery is rate limited', async () => {
    get.mockRejectedValueOnce({
      response: { headers: { 'retry-after': '12' }, status: 429 },
    });

    const result = await client.listOrganizations().catch(toMcpToolErrorResult);

    expect(result).toMatchObject({
      isError: true,
      structuredContent: { code: 'rate_limited', retryAfterSeconds: 12 },
    });
  });
});
