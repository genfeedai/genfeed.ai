import {
  axiosResponse,
  installMockHttp,
  type MockHttpInstance,
} from '@services/__mocks__/http.mock';
import { ResearchScansService } from '@services/social/research-scans.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('ResearchScansService HTTP contract', () => {
  let http: MockHttpInstance;
  let service: ResearchScansService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ResearchScansService('token');
    http = installMockHttp(service);
  });

  it('returns the status of every library the API lists', async () => {
    http.get.mockResolvedValueOnce(
      axiosResponse({
        data: [
          {
            hasPlan: false,
            library: 'trends',
            limit: { maxScans: 1, windowMs: 604_800_000 },
            nextAvailableAt: null,
            remaining: 1,
            used: 0,
          },
        ],
      }),
    );

    const statuses = await service.list();

    expect(statuses).toHaveLength(1);
    expect(statuses[0]?.remaining).toBe(1);
  });

  it('returns no statuses for a malformed body', async () => {
    http.get.mockResolvedValueOnce(axiosResponse({ data: 'nope' }));

    await expect(service.list()).resolves.toEqual([]);
  });
});
