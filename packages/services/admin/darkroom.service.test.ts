import { AdminDarkroomService } from '@services/admin/darkroom.service';
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

describe('AdminDarkroomService', () => {
  let service: AdminDarkroomService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AdminDarkroomService('test-token');
  });

  it('deserializes JSON:API character collections', async () => {
    mockGet.mockResolvedValue({
      data: {
        data: [{ attributes: { label: 'Nova', slug: 'nova' }, id: 'char-1' }],
      },
    });

    await expect(service.getCharacters()).resolves.toEqual([
      { attributes: { label: 'Nova', slug: 'nova' }, id: 'char-1' },
    ]);
  });

  it('deserializes JSON:API training collections', async () => {
    mockGet.mockResolvedValue({
      data: {
        data: [
          { attributes: { label: 'nova-run', status: 'queued' }, id: 'tr-1' },
        ],
      },
    });

    await expect(service.getTrainings()).resolves.toEqual([
      { attributes: { label: 'nova-run', status: 'queued' }, id: 'tr-1' },
    ]);
  });

  it('deserializes deleted characters as resources', async () => {
    mockDelete.mockResolvedValue({
      data: {
        data: {
          attributes: { isDeleted: true, slug: 'nova' },
          id: 'char-1',
        },
      },
    });

    await expect(service.deleteCharacter('nova')).resolves.toEqual({
      id: 'char-1',
      isDeleted: true,
      slug: 'nova',
    });
  });

  it('deserializes JSON:API campaign collections', async () => {
    mockGet.mockResolvedValue({
      data: {
        data: [
          {
            attributes: {
              assetsCount: 5,
              createdAt: '2026-03-01T00:00:00.000Z',
              name: 'spring',
              status: 'active',
            },
            id: 'spring',
          },
        ],
      },
    });

    await expect(service.getCampaigns()).resolves.toEqual([
      {
        attributes: {
          assetsCount: 5,
          createdAt: '2026-03-01T00:00:00.000Z',
          name: 'spring',
          status: 'active',
        },
        id: 'spring',
      },
    ]);
  });

  it('deserializes JSON:API pipeline stats resources', async () => {
    mockGet.mockResolvedValue({
      data: {
        data: {
          attributes: {
            assetsGenerated: 2,
            assetsPendingReview: 0,
            assetsPublished: 2,
            trainingsActive: 1,
          },
          id: 'pipeline',
        },
      },
    });

    await expect(service.getPipelineStats()).resolves.toEqual({
      assetsGenerated: 2,
      assetsPendingReview: 0,
      assetsPublished: 2,
      id: 'pipeline',
      trainingsActive: 1,
    });
  });

  it('deserializes EC2 action responses', async () => {
    mockPost.mockResolvedValue({
      data: {
        data: {
          attributes: { message: 'Instance started' },
          id: 'start:i-123',
        },
      },
    });

    await expect(service.ec2Action('i-123', 'start')).resolves.toEqual({
      id: 'start:i-123',
      message: 'Instance started',
    });
  });

  it('deserializes CloudFront invalidation responses', async () => {
    mockPost.mockResolvedValue({
      data: {
        data: {
          attributes: {
            invalidationId: 'INV-1',
            message: 'Invalidation created',
          },
          id: 'INV-1',
        },
      },
    });

    await expect(service.invalidateCloudFront()).resolves.toEqual({
      id: 'INV-1',
      invalidationId: 'INV-1',
      message: 'Invalidation created',
    });
  });
});
