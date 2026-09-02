import { ServicesService } from '@services/external/services.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { baseServiceConstructor, mockInstance, serializeServicePayload } =
  vi.hoisted(() => ({
    baseServiceConstructor: vi.fn(),
    mockInstance: {
      get: vi.fn(),
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

    constructor(...args: unknown[]) {
      baseServiceConstructor(...args);
    }

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
    mockInstance.get.mockResolvedValue({
      data: { status: 'available' },
    });
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

  it('posts a flat verify DTO that Nest integration controllers can read', async () => {
    const service = new ServicesService('restream', 'token');

    await service.postVerify({ code: 'oauth-code', state: 'oauth-state' });

    expect(mockInstance.post).toHaveBeenCalledWith('verify', {
      code: 'oauth-code',
      state: 'oauth-state',
    });
  });

  it('reads Threads readiness beside the canonical connect route', async () => {
    const service = new ServicesService('threads', 'token');

    await expect(service.getConnectReadiness()).resolves.toEqual({
      status: 'available',
    });

    expect(baseServiceConstructor).toHaveBeenCalledWith(
      '/services/threads',
      'token',
      expect.anything(),
      expect.anything(),
    );
    expect(mockInstance.get).toHaveBeenCalledWith('connect-readiness');
  });
});
