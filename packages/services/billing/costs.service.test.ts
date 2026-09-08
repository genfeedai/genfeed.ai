import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CostsService } from './costs.service';

const { mockGet } = vi.hoisted(() => ({ mockGet: vi.fn() }));
vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: { apiEndpoint: 'https://api.genfeed.localhost/v1' },
}));
vi.mock('@services/core/interceptor.service', () => ({
  HTTPBaseService: class {
    protected instance = { get: mockGet };
  },
}));
describe('CostsService customer usage', () => {
  beforeEach(() => vi.clearAllMocks());
  it('preserves server totals and page offsets', async () => {
    mockGet.mockResolvedValue({
      data: {
        data: [
          {
            id: 'row-26',
            type: 'cost-report-entries',
            attributes: { model: 'flux-schnell' },
          },
        ],
        links: { pagination: { limit: 25, page: 2, pages: 3, total: 53 } },
      },
    });
    const page = await new CostsService('test-token').getEntriesPage({
      brandId: 'brand-1',
      limit: 25,
      skip: 25,
    });
    expect(page).toMatchObject({
      total: 53,
      limit: 25,
      skip: 25,
      docs: [{ id: 'row-26', model: 'flux-schnell' }],
    });
    expect(mockGet).toHaveBeenCalledWith('/entries', {
      params: { brandId: 'brand-1', limit: 25, skip: 25 },
    });
  });
  it('uses the customer export endpoint with its brand scope', async () => {
    const data = new ArrayBuffer(2);
    mockGet.mockResolvedValue({ data });
    expect(
      await new CostsService('test-token').exportUsageCsv({
        brandId: 'brand-1',
      }),
    ).toBe(data);
    expect(mockGet).toHaveBeenCalledWith('/usage/export', {
      params: { brandId: 'brand-1' },
      responseType: 'arraybuffer',
    });
  });
});
