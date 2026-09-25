import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BrandMemoryService } from './brand-memory.service';

const getMock = vi.fn();

vi.mock('@services/core/interceptor.service', () => {
  class MockHTTPBaseService {
    instance = { get: getMock };

    constructor(_baseUrl?: string, _token?: string) {}

    static getBaseServiceInstance<T>(
      ServiceClass: new (...args: unknown[]) => T,
      ...args: unknown[]
    ): T {
      return new ServiceClass(...args);
    }
  }

  return { HTTPBaseService: MockHTTPBaseService };
});

vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: { apiEndpoint: 'https://api.example' },
}));

describe('BrandMemoryService', () => {
  beforeEach(() => {
    getMock.mockReset();
  });

  it('fetches brand memory insights', async () => {
    getMock.mockResolvedValue({
      data: {
        data: [
          {
            attributes: {
              category: 'timing',
              confidence: 0.8,
              insight: 'Evenings win',
            },
            id: 'brand-1:insight:0',
            type: 'brand-memory-insight',
          },
        ],
      },
    });

    const insights = await BrandMemoryService.getInstance('token').getInsights(
      'brand-1',
      { limit: 10 },
    );

    expect(getMock).toHaveBeenCalledWith('/brands/brand-1/memory/insights', {
      params: { limit: 10 },
      signal: undefined,
    });
    expect(insights).toEqual([
      expect.objectContaining({
        category: 'timing',
        id: 'brand-1:insight:0',
        insight: 'Evenings win',
      }),
    ]);
  });
});
