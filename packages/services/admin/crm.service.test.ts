import { AdminCrmService } from '@services/admin/crm.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGet = vi.fn();
const mockPost = vi.fn();
const mockPatch = vi.fn();
const mockDelete = vi.fn();

vi.mock('@helpers/data/json-api/json-api.helper', () => ({
  deserializeCollection: vi.fn(
    (document: { data: unknown[] }) => document.data,
  ),
  deserializeResource: vi.fn((document: { data: unknown }) => {
    const resource = document.data as
      | { id?: string; attributes?: Record<string, unknown> }
      | undefined;

    return {
      id: resource?.id,
      ...(resource?.attributes ?? {}),
    };
  }),
}));

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
      patch: mockPatch,
      post: mockPost,
    };

    constructor(_baseUrl: string, _token: string) {}

    static getBaseServiceInstance<T>(
      ServiceClass: new (...args: any[]) => T,
      ...args: any[]
    ): T {
      return new ServiceClass(...args);
    }
  }

  return { HTTPBaseService: MockHTTPBaseService };
});

describe('AdminCrmService', () => {
  let service: AdminCrmService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AdminCrmService('test-token');
  });

  it('deserializes JSON:API lead collections', async () => {
    mockGet.mockResolvedValue({
      data: {
        data: [{ attributes: { name: 'Lead A', status: 'new' }, id: 'lead-1' }],
      },
    });

    await expect(service.getLeads()).resolves.toEqual([
      { attributes: { name: 'Lead A', status: 'new' }, id: 'lead-1' },
    ]);
  });

  it('deserializes JSON:API single lead resources', async () => {
    mockGet.mockResolvedValue({
      data: {
        data: {
          attributes: { email: 'lead@example.com', name: 'Lead A' },
          id: 'lead-1',
        },
      },
    });

    await expect(service.getLead('lead-1')).resolves.toEqual({
      email: 'lead@example.com',
      id: 'lead-1',
      name: 'Lead A',
    });
  });

  it('deserializes JSON:API task collections', async () => {
    mockGet.mockResolvedValue({
      data: {
        data: [
          { attributes: { status: 'todo', title: 'Task A' }, id: 'task-1' },
        ],
      },
    });

    await expect(service.getTasks()).resolves.toEqual([
      { attributes: { status: 'todo', title: 'Task A' }, id: 'task-1' },
    ]);
  });

  it('deserializes deleted lead resources', async () => {
    mockDelete.mockResolvedValue({
      data: {
        data: {
          attributes: { isDeleted: true, name: 'Lead A' },
          id: 'lead-1',
        },
      },
    });

    await expect(service.deleteLead('lead-1')).resolves.toEqual({
      id: 'lead-1',
      isDeleted: true,
      name: 'Lead A',
    });
  });

  it('deserializes JSON:API analytics resources', async () => {
    mockGet.mockResolvedValue({
      data: {
        data: {
          attributes: {
            funnel: [{ count: 1, percentage: 100, stage: 'new' }],
            velocity: [],
          },
          id: 'analytics-30',
        },
      },
    });

    await expect(service.getAnalytics(30)).resolves.toEqual({
      funnel: [{ count: 1, percentage: 100, stage: 'new' }],
      id: 'analytics-30',
      velocity: [],
    });
  });
});
