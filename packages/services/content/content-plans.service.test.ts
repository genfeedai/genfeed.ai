import { PagesService } from '@services/content/pages.service';
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
    PagesService.setCurrentPage(1);
    PagesService.setTotalPages(1);
    PagesService.setTotalDocs(0);
  });

  it('requests one server page and records the pagination totals', async () => {
    mockGet.mockResolvedValue({
      data: {
        data: [],
        links: { pagination: { limit: 15, page: 2, pages: 4, total: 50 } },
      },
    });
    const controller = new AbortController();

    await ContentPlansService.getInstance('token').list(
      'brand-1',
      { limit: 15, page: 2 },
      controller.signal,
    );

    expect(mockGet).toHaveBeenCalledWith('/brands/brand-1/content/plans', {
      params: { limit: 15, page: 2 },
      signal: controller.signal,
    });
    expect(PagesService.getCurrentPage()).toBe(2);
    expect(PagesService.getTotalPages()).toBe(4);
    expect(PagesService.getTotalDocs()).toBe(50);
  });
});
