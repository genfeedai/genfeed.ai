import { AdminMarketplaceService } from '@services/admin/marketplace.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGet = vi.fn();
const mockPatch = vi.fn();
const mockPost = vi.fn();

vi.mock('@helpers/data/json-api/json-api.helper', () => ({
  deserializeCollection: vi.fn(
    (document: { data: unknown[] }) => document.data,
  ),
  deserializeResource: vi.fn((document: { data: unknown }) => {
    const resource = document.data as
      | { id?: string; attributes?: Record<string, unknown> }
      | undefined;

    return {
      id: resource?.id,
      ...(resource?.attributes ?? {}),
    };
  }),
}));

vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: {
    apiEndpoint: 'https://api.genfeed.ai/v1',
  },
}));

vi.mock('@services/core/interceptor.service', () => {
  class MockHTTPBaseService {
    protected instance = {
      get: mockGet,
      patch: mockPatch,
      post: mockPost,
    };

    constructor(_baseUrl: string, _token: string) {}

    static getBaseServiceInstance<T>(
      ServiceClass: new (...args: any[]) => T,
      ...args: any[]
    ): T {
      return new ServiceClass(...args);
    }
  }

  return { HTTPBaseService: MockHTTPBaseService };
});

describe('AdminMarketplaceService', () => {
  let service: AdminMarketplaceService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AdminMarketplaceService('test-token');
  });

  it('deserializes analytics overview resources', async () => {
    mockGet.mockResolvedValue({
      data: {
        data: {
          attributes: {
            completedOrders: 3,
            failedOrders: 1,
            pendingOrders: 2,
            recentSales: [],
            totalPlatformFees: 150,
            totalRevenue: 1200,
            totalSales: 6,
            totalSellerEarnings: 1050,
          },
          id: 'org-1',
        },
      },
    });

    await expect(service.getAnalyticsOverview(30)).resolves.toEqual({
      completedOrders: 3,
      failedOrders: 1,
      id: 'org-1',
      pendingOrders: 2,
      recentSales: [],
      totalPlatformFees: 150,
      totalRevenue: 1200,
      totalSales: 6,
      totalSellerEarnings: 1050,
    });
  });
});
