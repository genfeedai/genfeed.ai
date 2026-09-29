import { AdminFeaturedWorkflowsService } from '@services/admin/featured-workflows.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockDelete = vi.fn();
const mockGet = vi.fn();
const mockPut = vi.fn();

vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: {
    apiEndpoint: 'https://api.genfeed.ai/v1',
  },
}));

vi.mock('@services/core/interceptor.service', () => {
  class MockHTTPBaseService {
    protected instance = {
      delete: mockDelete,
      get: mockGet,
      put: mockPut,
    };

    static getBaseServiceInstance<T>(
      ServiceClass: new (...args: never[]) => T,
      ...args: never[]
    ): T {
      return new ServiceClass(...args);
    }
  }

  return { HTTPBaseService: MockHTTPBaseService };
});

const PINS = [
  {
    description: null,
    featuredRank: 1,
    id: 'wf-a',
    label: 'A',
    thumbnail: null,
  },
];

describe('AdminFeaturedWorkflowsService (#5511)', () => {
  let service: AdminFeaturedWorkflowsService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AdminFeaturedWorkflowsService('test-token');
  });

  it('lists the pins with cancellation', async () => {
    const signal = new AbortController().signal;
    mockGet.mockResolvedValue({ data: { data: PINS } });

    await expect(service.list(signal)).resolves.toEqual(PINS);
    expect(mockGet).toHaveBeenCalledWith('', { signal });
  });

  it('pins, unpins and reorders, returning the stored pins', async () => {
    mockPut.mockResolvedValue({ data: { data: PINS } });
    mockDelete.mockResolvedValue({ data: { data: [] } });

    await expect(service.pin('wf-a')).resolves.toEqual(PINS);
    await expect(service.unpin('wf-a')).resolves.toEqual([]);
    await expect(service.reorder(['wf-a'])).resolves.toEqual(PINS);

    expect(mockPut).toHaveBeenNthCalledWith(1, '/wf-a');
    expect(mockDelete).toHaveBeenCalledWith('/wf-a');
    expect(mockPut).toHaveBeenNthCalledWith(2, '/order', {
      workflowIds: ['wf-a'],
    });
  });
});
