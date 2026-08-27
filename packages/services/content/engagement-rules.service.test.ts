import { EngagementRulesService } from '@services/content/engagement-rules.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockInstance = {
  get: vi.fn(),
  post: vi.fn(),
};

vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: { apiEndpoint: 'https://api.test.com' },
}));

vi.mock('@services/core/interceptor.service', () => ({
  HTTPBaseService: class MockHttpBaseService {
    public instance = mockInstance;

    static getBaseServiceInstance<T>(
      ServiceClass: new (token: string) => T,
      token: string,
    ): T {
      return new ServiceClass(token);
    }
  },
}));

vi.mock('@services/core/json-api', () => ({
  extractCollection: (document: { items?: unknown[] }) => document.items ?? [],
  extractResource: (document: { item?: unknown }) => document.item,
}));

describe('EngagementRulesService', () => {
  let service: EngagementRulesService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new EngagementRulesService('token');
  });

  it('lists rules for a release target', async () => {
    mockInstance.get.mockResolvedValue({
      data: { items: [{ id: 'rule-1' }] },
    });

    const result = await service.findAll({
      postGroup: 'release-1',
      target: 'target-1',
    });

    expect(mockInstance.get).toHaveBeenCalledWith('', {
      params: { postGroup: 'release-1', target: 'target-1' },
      signal: undefined,
    });
    expect(result).toEqual([{ id: 'rule-1' }]);
  });
});
