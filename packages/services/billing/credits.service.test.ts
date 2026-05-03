import { CreditsService } from '@services/billing/credits.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockDeserializeResource, mockGet } = vi.hoisted(() => ({
  mockDeserializeResource: vi.fn(),
  mockGet: vi.fn(),
}));

vi.mock('@genfeedai/helpers/data/json-api/json-api.helper', () => ({
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

  it('deserializes JSON:API BYOK usage summaries', async () => {
    mockGet.mockResolvedValue({
      data: {
        data: {
          attributes: {
            billableUsage: 1250,
            billingStatus: 'active',
            freeRemaining: 0,
            freeThreshold: 500,
            periodEnd: '2026-03-31T23:59:59.999Z',
            periodStart: '2026-03-01T00:00:00.000Z',
            projectedFee: 0.63,
            rollover: 0,
            totalUsage: 1750,
          },
          id: 'usage-summary',
          type: 'byok-usage-summary',
        },
      },
    });

    mockDeserializeResource.mockReturnValue({
      billableUsage: 1250,
      billingStatus: 'active',
      freeRemaining: 0,
      freeThreshold: 500,
      periodEnd: '2026-03-31T23:59:59.999Z',
      periodStart: '2026-03-01T00:00:00.000Z',
      projectedFee: 0.63,
      rollover: 0,
      totalUsage: 1750,
    });

    const service = new CreditsService('test-token');

    await expect(service.getByokUsageSummary()).resolves.toEqual({
      billableUsage: 1250,
      billingStatus: 'active',
      freeRemaining: 0,
      freeThreshold: 500,
      periodEnd: '2026-03-31T23:59:59.999Z',
      periodStart: '2026-03-01T00:00:00.000Z',
      projectedFee: 0.63,
      rollover: 0,
      totalUsage: 1750,
    });

    expect(mockDeserializeResource).toHaveBeenCalledWith({
      data: {
        attributes: {
          billableUsage: 1250,
          billingStatus: 'active',
          freeRemaining: 0,
          freeThreshold: 500,
          periodEnd: '2026-03-31T23:59:59.999Z',
          periodStart: '2026-03-01T00:00:00.000Z',
          projectedFee: 0.63,
          rollover: 0,
          totalUsage: 1750,
        },
        id: 'usage-summary',
        type: 'byok-usage-summary',
      },
    });
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
      ],
    });

    expect(mockGet).toHaveBeenCalledWith('/topbar-balances');
  });
});
