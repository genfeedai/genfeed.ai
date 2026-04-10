import { AdminAnnouncementsService } from '@services/admin/announcements.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGet = vi.fn();
const mockPost = vi.fn();

vi.mock('@genfeedai/helpers/data/json-api/json-api.helper', () => ({
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
      get: mockGet,
      post: mockPost,
    };

    static getBaseServiceInstance<T>(
      ServiceClass: new (...args: any[]) => T,
      ...args: any[]
    ): T {
      return new ServiceClass(...args);
    }
  }

  return { HTTPBaseService: MockHTTPBaseService };
});

describe('AdminAnnouncementsService', () => {
  let service: AdminAnnouncementsService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AdminAnnouncementsService('test-token');
  });

  it('deserializes announcement history collections', async () => {
    mockGet.mockResolvedValue({
      data: {
        data: [
          {
            attributes: { body: 'Release note', createdAt: '2026-03-09' },
            id: 'announcement-1',
          },
        ],
      },
    });

    await expect(service.getAnnouncements()).resolves.toEqual([
      {
        attributes: { body: 'Release note', createdAt: '2026-03-09' },
        id: 'announcement-1',
      },
    ]);
  });

  it('deserializes announcement broadcasts as resources', async () => {
    mockPost.mockResolvedValue({
      data: {
        data: {
          attributes: { body: 'New launch', createdAt: '2026-03-09' },
          id: 'announcement-2',
        },
      },
    });

    await expect(
      service.broadcast({
        body: 'New launch',
        channels: { discord: true },
      }),
    ).resolves.toEqual({
      body: 'New launch',
      createdAt: '2026-03-09',
      id: 'announcement-2',
    });
  });
});
