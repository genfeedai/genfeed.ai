import { ServicesService } from '@services/external/services.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockInstance, serializeServicePayload } = vi.hoisted(() => ({
  mockInstance: {
    post: vi.fn(),
  },
  serializeServicePayload: vi.fn((body: unknown) => ({
    data: {
      attributes: body,
      type: 'service',
    },
  })),
}));

vi.mock('@genfeedai/serializers', () => ({
  CredentialOAuthSerializer: {},
  CredentialSerializer: {},
  ServiceSerializer: {
    serialize: serializeServicePayload,
  },
}));

vi.mock('@services/core/base.service', () => ({
  BaseService: class MockBaseService {
    public instance = mockInstance;

    extractResource<T>(document: { data?: { attributes?: T } } | T): T {
      if (
        typeof document === 'object' &&
        document !== null &&
        'data' in document
      ) {
        return document.data?.attributes as T;
      }

      return document as T;
    }
  },
}));

describe('ServicesService OAuth request contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInstance.post.mockResolvedValue({
      data: {
        data: {
          attributes: { url: 'https://provider.example/oauth' },
          type: 'credential-oauth',
        },
      },
    });
  });

  it('posts a flat connect DTO that Nest integration controllers can read', async () => {
    const service = new ServicesService('restream', 'token');

    await service.postConnect({ brandId: 'brand-1' });

    expect(mockInstance.post).toHaveBeenCalledWith('connect', {
      brandId: 'brand-1',
    });
  });
});
