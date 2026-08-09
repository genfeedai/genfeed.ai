import {
  axiosResponse,
  collectionDocument,
  installMockHttp,
  type MockHttpInstance,
  resourceDocument,
} from '@services/__mocks__/http.mock';
import { TemplateService } from '@services/content/template.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@services/core/logger.service', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

describe('TemplateService', () => {
  let service: TemplateService;
  let http: MockHttpInstance;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new TemplateService('template-token');
    http = installMockHttp(service);
  });

  it('getInstance caches per token', () => {
    const first = TemplateService.getInstance('tok');
    expect(TemplateService.getInstance('tok')).toBe(first);
  });

  describe('getTemplates', () => {
    it('translates the filter into query params', async () => {
      http.get.mockResolvedValue(
        axiosResponse(collectionDocument([{ id: 'tpl_1', label: 'T' }])),
      );

      const result = await service.getTemplates({
        category: ['marketing', 'sales'],
        difficulty: ['easy'],
        isPremium: true,
        minRating: 4,
        scope: 'organization',
        search: 'hook',
        sortBy: 'rating',
      });

      expect(http.get).toHaveBeenCalledWith('', {
        params: {
          category: 'marketing,sales',
          difficulty: 'easy',
          isPremium: 'true',
          minRating: '4',
          scope: 'organization',
          search: 'hook',
          sortBy: 'rating',
        },
        signal: undefined,
      });
      expect(result).toHaveLength(1);
    });

    it('sends no params without a filter', async () => {
      http.get.mockResolvedValue(axiosResponse(collectionDocument([])));

      await service.getTemplates();

      expect(http.get).toHaveBeenCalledWith('', {
        params: {},
        signal: undefined,
      });
    });

    it('wraps failures in a structured error', async () => {
      http.get.mockRejectedValue({
        response: { data: { message: 'nope' }, status: 500 },
      });

      await expect(service.getTemplates()).rejects.toMatchObject({
        status: 500,
      });
    });
  });

  it('getTemplate fetches one template by id', async () => {
    http.get.mockResolvedValue(
      axiosResponse(resourceDocument({ label: 'T' }, { id: 'tpl_1' })),
    );

    const result = await service.getTemplate('tpl_1');

    expect(http.get).toHaveBeenCalledWith('/tpl_1', {
      params: {},
      signal: undefined,
    });
    expect(result.id).toBe('tpl_1');
  });

  it('createTemplate POSTs the template', async () => {
    http.post.mockResolvedValue(
      axiosResponse(resourceDocument({ label: 'New' }, { id: 'tpl_new' })),
    );

    const result = await service.createTemplate({ label: 'New' });

    expect(http.post).toHaveBeenCalledWith('/', { label: 'New' });
    expect(result.id).toBe('tpl_new');
  });

  it('updateTemplate PATCHes the template', async () => {
    http.patch.mockResolvedValue(
      axiosResponse(resourceDocument({ label: 'Edit' }, { id: 'tpl_1' })),
    );

    const result = await service.updateTemplate('tpl_1', { label: 'Edit' });

    expect(http.patch).toHaveBeenCalledWith('/tpl_1', { label: 'Edit' });
    expect(result.id).toBe('tpl_1');
  });

  it('deleteTemplate DELETEs the template', async () => {
    http.delete.mockResolvedValue(
      axiosResponse(resourceDocument({ label: 'Gone' }, { id: 'tpl_1' })),
    );

    await expect(service.deleteTemplate('tpl_1')).resolves.toBeUndefined();

    expect(http.delete).toHaveBeenCalledWith('/tpl_1');
  });

  describe('suggestions and generation', () => {
    it('getSuggestions POSTs the query with context', async () => {
      http.post.mockResolvedValue(
        axiosResponse([{ id: 'sug_1', label: 'Suggestion' }]),
      );

      const result = await service.getSuggestions('hooks', { niche: 'saas' });

      expect(http.post).toHaveBeenCalledWith('suggestions', {
        context: { niche: 'saas' },
        query: 'hooks',
      });
      expect(result).toEqual([{ id: 'sug_1', label: 'Suggestion' }]);
    });

    it('getSuggestions returns [] for an empty response body', async () => {
      http.post.mockResolvedValue(axiosResponse(undefined));

      const result = await service.getSuggestions('hooks');

      expect(result).toEqual([]);
    });

    it('generateFromTemplate POSTs the generation request', async () => {
      const generation = { content: 'Generated', id: 'gen_1' };
      http.post.mockResolvedValue(axiosResponse(generation));

      const result = await service.generateFromTemplate({
        template: 'tpl_1',
        variables: { name: 'Vincent' },
      });

      expect(http.post).toHaveBeenCalledWith('generate', {
        template: 'tpl_1',
        variables: { name: 'Vincent' },
      });
      expect(result).toEqual(generation);
    });

    it('trackUsage POSTs the usage payload', async () => {
      const usage = { id: 'use_1', template: 'tpl_1' };
      http.post.mockResolvedValue(axiosResponse(usage));

      const result = await service.trackUsage({ template: 'tpl_1' });

      expect(http.post).toHaveBeenCalledWith('usage', { template: 'tpl_1' });
      expect(result).toEqual(usage);
    });

    it('getTemplateAnalytics GETs the analytics payload', async () => {
      const analytics = {
        avgPerformance: {},
        successRate: 0.8,
        topVariables: [],
        totalUsage: 12,
      };
      http.get.mockResolvedValue(axiosResponse(analytics));

      const result = await service.getTemplateAnalytics('tpl_1');

      expect(http.get).toHaveBeenCalledWith('/tpl_1/analytics');
      expect(result).toEqual(analytics);
    });

    it('duplicateTemplate POSTs to the duplicate route', async () => {
      http.post.mockResolvedValue(
        axiosResponse(resourceDocument({ label: 'Copy' }, { id: 'tpl_copy' })),
      );

      const result = await service.duplicateTemplate('tpl_1', {
        label: 'Copy',
      });

      expect(http.post).toHaveBeenCalledWith('//tpl_1/duplicate', {
        label: 'Copy',
      });
      expect(result.id).toBe('tpl_copy');
    });

    it('duplicateTemplate defaults customizations to an empty object', async () => {
      http.post.mockResolvedValue(
        axiosResponse(resourceDocument({ label: 'Copy' }, { id: 'tpl_copy' })),
      );

      await service.duplicateTemplate('tpl_1');

      expect(http.post).toHaveBeenCalledWith('//tpl_1/duplicate', {});
    });
  });

  describe('discovery lists', () => {
    it('getPopularTemplates GETs the popular sort with limit', async () => {
      http.get.mockResolvedValue(
        axiosResponse(collectionDocument([{ id: 'tpl_p', label: 'Pop' }])),
      );

      const result = await service.getPopularTemplates(3);

      expect(http.get).toHaveBeenCalledWith('?sort=popular&limit=3');
      expect(result).toHaveLength(1);
    });

    it('getRecommended GETs the recommended list with default limit', async () => {
      http.get.mockResolvedValue(
        axiosResponse(collectionDocument([{ id: 'tpl_r', label: 'Rec' }])),
      );

      const result = await service.getRecommended();

      expect(http.get).toHaveBeenCalledWith('recommended?limit=10');
      expect(result).toHaveLength(1);
    });

    it('searchTemplates URL-encodes the query', async () => {
      http.get.mockResolvedValue(
        axiosResponse(collectionDocument([{ id: 'tpl_s', label: 'Found' }])),
      );

      const result = await service.searchTemplates('a b&c');

      expect(http.get).toHaveBeenCalledWith('search?q=a%20b%26c');
      expect(result).toHaveLength(1);
    });
  });
});
