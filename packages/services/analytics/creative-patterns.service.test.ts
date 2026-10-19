import { PagesService } from '@services/content/pages.service';
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

const collectionDocument = {
  data: [
    {
      attributes: { label: 'Hook', patternType: 'hook_formula' },
      id: 'pattern-1',
      type: 'creative-pattern',
    },
  ],
  links: {
    pagination: { limit: 15, page: 2, pages: 4, total: 51 },
    self: '/creative-patterns?page=2&limit=15',
  },
};

describe('CreativePatternsService', () => {
  beforeEach(() => {
    getMock.mockReset();
    getMock.mockResolvedValue({ data: collectionDocument });
    PagesService.setCurrentPage(1);
    PagesService.setTotalPages(1);
    PagesService.setTotalDocs(0);
  });

  it('reads a JSON:API page from the Nest collection, not a Next /api route', async () => {
    const service = CreativePatternsService.getInstance('token-1');
    const patterns = await service.findAll(
      { brandId: 'brand-1', platform: 'instagram' },
      { limit: 15, page: 2 },
    );

    expect(getMock).toHaveBeenCalledWith(
      '',
      expect.objectContaining({
        params: expect.objectContaining({
          brandId: 'brand-1',
          limit: 15,
          page: 2,
          platform: 'instagram',
        }),
      }),
    );
    expect(patterns).toEqual([
      expect.objectContaining({
        id: 'pattern-1',
        label: 'Hook',
        patternType: 'hook_formula',
      }),
    ]);
  });

  it('publishes the page totals so AutoPagination can render', async () => {
    const service = CreativePatternsService.getInstance('token-1');

    await service.findAll({}, { limit: 15, page: 2 });

    expect(PagesService.getCurrentPage()).toBe(2);
    expect(PagesService.getTotalPages()).toBe(4);
    expect(PagesService.getTotalDocs()).toBe(51);
  });

  it('leaves the page totals alone when no page was requested', async () => {
    const service = CreativePatternsService.getInstance('token-1');

    await service.findAll();

    expect(PagesService.getTotalPages()).toBe(1);
    expect(PagesService.getTotalDocs()).toBe(0);
  });

  it('forwards the abort signal', async () => {
    const service = CreativePatternsService.getInstance('token-1');
    const controller = new AbortController();

    await service.findAll({}, { page: 1 }, controller.signal);

    expect(getMock).toHaveBeenCalledWith(
      '',
      expect.objectContaining({ signal: controller.signal }),
    );
  });
});
