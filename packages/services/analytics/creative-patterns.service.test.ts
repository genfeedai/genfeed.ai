import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CreativePatternsService } from './creative-patterns.service';

const getMock = vi.fn();

vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: {
    apiEndpoint: 'https://api.genfeed.ai/v1',
  },
}));

vi.mock('@services/core/interceptor.service', () => {
  class HTTPBaseService {
    instance = { get: getMock };
    static getBaseServiceInstance(
      ctor: new (token: string) => HTTPBaseService,
      token: string,
    ) {
      return new ctor(token);
    }
  }

  return { HTTPBaseService };
});

describe('CreativePatternsService', () => {
  beforeEach(() => {
    getMock.mockReset();
    getMock.mockResolvedValue({ data: { patterns: [{ label: 'Hook' }] } });
  });

  it('reads patterns from the Nest collection, not a Next /api route', async () => {
    const service = CreativePatternsService.getInstance('token-1');
    const patterns = await service.findAll({
      brandId: 'brand-1',
      platform: 'instagram',
    });

    expect(getMock).toHaveBeenCalledWith(
      '',
      expect.objectContaining({
        params: expect.objectContaining({
          brandId: 'brand-1',
          platform: 'instagram',
        }),
      }),
    );
    expect(patterns).toEqual([{ label: 'Hook' }]);
  });
});
