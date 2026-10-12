import { AdminPlatformSettingsService } from '@services/admin/platform-settings.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGet = vi.fn();

vi.mock('@services/core/json-api', () => ({
  deserializeResource: vi.fn((document: { data: unknown }) => {
    const resource = document.data as
      | { id?: string; attributes?: Record<string, unknown> }
      | undefined;
    return { id: resource?.id, ...(resource?.attributes ?? {}) };
  }),
}));

vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: { apiEndpoint: 'https://api.genfeed.ai/v1' },
}));

vi.mock('@services/core/interceptor.service', () => {
  class MockHTTPBaseService {
    protected instance = { get: mockGet };

    static getBaseServiceInstance<T>(
      ServiceClass: new (...args: string[]) => T,
      ...args: string[]
    ): T {
      return new ServiceClass(...args);
    }
  }
  return { HTTPBaseService: MockHTTPBaseService };
});

const florence = {
  externalId: 'lucataco/florence-2-large:abc',
  key: 'lucataco/florence-2-large',
  label: 'Florence-2 Large',
  pricingType: 'per-second',
  providerCostUsd: 0.000975,
};

describe('AdminPlatformSettingsService.getBrandVisionModels', () => {
  let service: AdminPlatformSettingsService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AdminPlatformSettingsService('test-token');
  });

  it('returns the catalog options for each job', async () => {
    mockGet.mockResolvedValue({
      data: {
        data: {
          attributes: { detect: [], ocr: [florence] },
          id: 'brand-vision-models',
        },
      },
    });

    await expect(service.getBrandVisionModels()).resolves.toEqual({
      detect: [],
      id: 'brand-vision-models',
      ocr: [florence],
    });
    expect(mockGet).toHaveBeenCalledWith('brand-vision-models', {
      signal: undefined,
    });
  });

  it('yields empty lists for a response without option arrays', async () => {
    mockGet.mockResolvedValue({ data: { data: { attributes: {}, id: 'x' } } });

    await expect(service.getBrandVisionModels()).resolves.toEqual({
      detect: [],
      id: 'x',
      ocr: [],
    });
  });

  it('drops malformed option entries', async () => {
    mockGet.mockResolvedValue({
      data: {
        data: {
          attributes: { detect: [{ key: 1 }, null], ocr: [florence, 'x'] },
        },
      },
    });

    await expect(service.getBrandVisionModels()).resolves.toEqual({
      detect: [],
      id: 'brand-vision-models',
      ocr: [florence],
    });
  });
});
