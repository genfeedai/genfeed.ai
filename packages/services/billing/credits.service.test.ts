import { CreditsService } from '@services/billing/credits.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockDeserializeResource, mockGet } = vi.hoisted(() => ({
  mockDeserializeResource: vi.fn(),
  mockGet: vi.fn(),
}));

vi.mock('@services/core/json-api', () => ({
  deserializeResource: mockDeserializeResource,
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
    };

    static getBaseServiceInstance<T>(
      ServiceClass: new (...args: unknown[]) => T,
      ...args: unknown[]
    ): T {
      return new ServiceClass(...args);
    }
  }

  return { HTTPBaseService: MockHTTPBaseService };
});

describe('CreditsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deserializes JSON:API topbar balances', async () => {
    mockGet.mockResolvedValue({
      data: {
        data: {
          attributes: {
            generatedAt: '2026-05-02T12:00:00.000Z',
            segments: [
              {
                balance: 420,
                currencyOrUnit: 'credits',
                label: 'Genfeed',
                lastSyncedAt: '2026-05-02T12:00:00.000Z',
                provider: 'genfeed',
                status: 'available',
              },
              {
                balance: null,
                currencyOrUnit: 'USD',
                error: 'Balance unavailable',
                label: 'Replicate',
                lastSyncedAt: '2026-05-02T12:00:00.000Z',
                provider: 'replicate',
                status: 'unavailable',
              },
              {
                balance: 12.34,
                currencyOrUnit: 'USD',
                label: 'fal.ai',
                lastSyncedAt: '2026-05-02T12:00:00.000Z',
                provider: 'fal',
                status: 'available',
              },
            ],
          },
          id: 'topbar-balances',
          type: 'topbar-balances',
        },
      },
    });

    mockDeserializeResource.mockReturnValue({
      generatedAt: '2026-05-02T12:00:00.000Z',
      segments: [
        {
          balance: 420,
          currencyOrUnit: 'credits',
          label: 'Genfeed',
          lastSyncedAt: '2026-05-02T12:00:00.000Z',
          provider: 'genfeed',
          status: 'available',
        },
        {
          balance: null,
          currencyOrUnit: 'USD',
          error: 'Balance unavailable',
          label: 'Replicate',
          lastSyncedAt: '2026-05-02T12:00:00.000Z',
          provider: 'replicate',
          status: 'unavailable',
        },
        {
          balance: 12.34,
          currencyOrUnit: 'USD',
          label: 'fal.ai',
          lastSyncedAt: '2026-05-02T12:00:00.000Z',
          provider: 'fal',
          status: 'available',
        },
      ],
    });

    const service = new CreditsService('test-token');

    await expect(service.getTopbarBalances()).resolves.toEqual({
      generatedAt: '2026-05-02T12:00:00.000Z',
      segments: [
        {
          balance: 420,
          currencyOrUnit: 'credits',
          label: 'Genfeed',
          lastSyncedAt: '2026-05-02T12:00:00.000Z',
          provider: 'genfeed',
          status: 'available',
        },
        {
          balance: null,
          currencyOrUnit: 'USD',
          error: 'Balance unavailable',
          label: 'Replicate',
          lastSyncedAt: '2026-05-02T12:00:00.000Z',
          provider: 'replicate',
          status: 'unavailable',
        },
        {
          balance: 12.34,
          currencyOrUnit: 'USD',
          label: 'fal.ai',
          lastSyncedAt: '2026-05-02T12:00:00.000Z',
          provider: 'fal',
          status: 'available',
        },
      ],
    });

    expect(mockGet).toHaveBeenCalledWith('/topbar-balances', {
      timeout: 5_000,
    });
  });
});
