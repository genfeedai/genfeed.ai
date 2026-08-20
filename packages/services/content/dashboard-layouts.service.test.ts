import { DashboardLayoutsService } from '@services/content/dashboard-layouts.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGet, mockMapOne } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockMapOne: vi.fn(),
}));

vi.mock('@services/core/base.service', () => {
  class MockBaseService {
    protected instance = { get: mockGet };
    protected mapOne = mockMapOne;

    static getDataServiceInstance<T>(
      ServiceClass: new (...args: unknown[]) => T,
      ...args: unknown[]
    ): T {
      return new ServiceClass(...args);
    }
  }

  return { BaseService: MockBaseService };
});

describe('DashboardLayoutsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('treats a missing saved layout as an expected empty result', async () => {
    mockGet.mockResolvedValue({ data: { data: null }, status: 200 });

    const service = new DashboardLayoutsService('token');
    const result = await service.findForPage('brand-1');

    expect(result).toBeNull();
    expect(mockMapOne).not.toHaveBeenCalled();
    expect(mockGet).toHaveBeenCalledWith('', {
      params: { brand: 'brand-1', pageKey: 'workspace-overview' },
    });
  });

  it('maps a persisted dashboard layout response', async () => {
    const responseDocument = { data: { id: 'layout-1' } };
    const mappedLayout = { id: 'layout-1' };
    mockGet.mockResolvedValue({ data: responseDocument, status: 200 });
    mockMapOne.mockResolvedValue(mappedLayout);

    const service = new DashboardLayoutsService('token');
    const result = await service.findForPage('brand-1', 'analytics-overview');

    expect(mockMapOne).toHaveBeenCalledWith(responseDocument);
    expect(result).toBe(mappedLayout);
  });
});
