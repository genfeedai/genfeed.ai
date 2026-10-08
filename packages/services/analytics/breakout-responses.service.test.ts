import { ORGANIZATION_CONTEXT_HEADER } from '@genfeedai/contracts/constants';
import {
  axiosResponse,
  collectionDocument,
  installMockHttp,
  resourceDocument,
} from '@services/__mocks__/http.mock';
import { BreakoutResponsesService } from '@services/analytics/breakout-responses.service';
import {
  clearRequestOrganizationId,
  setRequestOrganizationId,
} from '@services/core/interceptor.service';
import axios, { type AxiosAdapter } from 'axios';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/helpers/ui/modal/modal.helper');

afterEach(() => {
  clearRequestOrganizationId();
  vi.restoreAllMocks();
});

describe('BreakoutResponsesService read-only JSON:API client', () => {
  it('lists encoded brand paths with pagination, filters and cancellation', async () => {
    const service = new BreakoutResponsesService('token');
    const http = installMockHttp(service);
    const signal = new AbortController().signal;
    http.get.mockResolvedValue(
      axiosResponse(
        collectionDocument(
          [
            {
              id: 'response',
              state: 'detected',
              outputs: null,
              trigger: { targetValue: 0, ratio: null },
            },
          ],
          { pagination: { limit: 20, page: 2, pages: 3, total: 50 } },
        ),
      ),
    );
    const result = await service.list(
      'brand/a',
      { page: 2, limit: 20, credentialId: 'credential' },
      signal,
    );
    expect(http.get).toHaveBeenCalledWith('brand%2Fa/breakout-responses', {
      params: { page: 2, limit: 20, credentialId: 'credential' },
      signal,
    });
    expect(result).toMatchObject({
      page: 2,
      pages: 3,
      total: 50,
      docs: [
        {
          id: 'response',
          outputs: null,
          trigger: { targetValue: 0, ratio: null },
        },
      ],
    });
    for (const method of [http.post, http.patch, http.put, http.delete])
      expect(method).not.toHaveBeenCalled();
  });

  it('preserves empty plans and only requests capacity when explicitly selected', async () => {
    const service = new BreakoutResponsesService('token');
    const http = installMockHttp(service);
    const signal = new AbortController().signal;
    http.get.mockResolvedValue(
      axiosResponse(
        resourceDocument(
          {
            state: 'detected',
            outputs: [],
            outputRegistryStatus: 'current',
            capacity: null,
          },
          { id: 'r/1' },
        ),
      ),
    );
    const detail = await service.detail('brand', 'r/1', {}, signal);
    expect(detail).toMatchObject({ id: 'r/1', outputs: [], capacity: null });
    expect(http.get).toHaveBeenLastCalledWith(
      'brand/breakout-responses/r%2F1',
      { params: {}, signal },
    );
    await service.detail(
      'brand',
      'r/1',
      { strategyId: 'selected-strategy' },
      signal,
    );
    expect(http.get).toHaveBeenLastCalledWith(
      'brand/breakout-responses/r%2F1',
      { params: { strategyId: 'selected-strategy' }, signal },
    );
  });

  it('propagates failed reads instead of returning a false empty collection', async () => {
    const service = new BreakoutResponsesService('token');
    const http = installMockHttp(service);
    http.get.mockRejectedValue(new Error('Access denied'));
    await expect(service.list('brand')).rejects.toThrow('Access denied');
    await expect(service.detail('brand', 'response')).rejects.toThrow(
      'Access denied',
    );
  });
});

describe('organization-bound breakout reads', () => {
  function installAdapter() {
    const adapter = vi.fn<AxiosAdapter>(async (config) => ({
      config,
      data: { data: [] },
      headers: {},
      status: 200,
      statusText: 'OK',
    }));
    const create = axios.create.bind(axios);
    vi.spyOn(axios, 'create').mockImplementation((config) =>
      create({ ...config, adapter }),
    );
    return adapter;
  }

  it('binds a fresh service to the current selected organization', async () => {
    const adapter = installAdapter();
    setRequestOrganizationId('org-a');
    const service = BreakoutResponsesService.forOrganization('token', 'org-a');
    expect(BreakoutResponsesService.forOrganization('token', 'org-a')).not.toBe(
      service,
    );
    await service.list('brand');
    expect(
      adapter.mock.calls[0]?.[0].headers[ORGANIZATION_CONTEXT_HEADER],
    ).toBe('org-a');
  });

  it.each(['list', 'detail'] as const)(
    'cancels %s when the organization changes before dispatch',
    async (operation) => {
      const adapter = installAdapter();
      setRequestOrganizationId('org-a');
      const service = BreakoutResponsesService.forOrganization(
        'token',
        'org-a',
      );
      const request =
        operation === 'list'
          ? service.list('brand')
          : service.detail('brand', 'response');
      setRequestOrganizationId('org-b');
      setRequestOrganizationId('org-a');
      await expect(request).rejects.toMatchObject({
        isCancelled: true,
        silent: true,
      });
      expect(adapter).not.toHaveBeenCalled();
    },
  );
});
