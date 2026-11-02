import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGet } = vi.hoisted(() => ({ mockGet: vi.fn() }));

vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: { apiEndpoint: 'https://api.test/v1' },
}));

vi.mock('@services/core/interceptor.service', () => {
  class MockHTTPBaseService {
    instance = { get: mockGet };
    static getBaseServiceInstance(
      Service: new (token: string) => unknown,
      token: string,
    ) {
      return new Service(token);
    }
  }
  return { HTTPBaseService: MockHTTPBaseService };
});

import { ContentPlansService } from '@services/content/content-plans.service';

describe('ContentPlansService.list', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns one server page with its pagination totals', async () => {
    mockGet.mockResolvedValue({
      data: {
        data: [],
        links: { pagination: { limit: 15, page: 2, pages: 4, total: 50 } },
      },
    });
    const controller = new AbortController();

    const page = await ContentPlansService.getInstance('token').list(
      'brand-1',
      { limit: 15, page: 2 },
      controller.signal,
    );

    expect(mockGet).toHaveBeenCalledWith('/brands/brand-1/content/plans', {
      params: { limit: 15, page: 2 },
      signal: controller.signal,
    });
    expect(page).toMatchObject({
      page: 2,
      totalPages: 4,
      total: 50,
      items: [],
    });
  });
});
