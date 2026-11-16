import {
  Credential,
  CredentialOAuth,
} from '@genfeedai/models/auth/credential.model';
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

    extractCollection<T>(document: { data?: Array<{ attributes?: T }> }): T[] {
      return (document.data ?? []).map((item) => item.attributes as T);
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

    const result = await service.postConnect({ brandId: 'brand-1' });

    expect(result).toBeInstanceOf(CredentialOAuth);
    expect(result).toEqual({ url: 'https://provider.example/oauth' });

    expect(mockInstance.post).toHaveBeenCalledWith('connect', {
      brandId: 'brand-1',
    });
  });

  it('posts a flat verify DTO that Nest integration controllers can read', async () => {
    const service = new ServicesService('restream', 'token');

    const credential = await service.postVerify({
      code: 'oauth-code',
      state: 'oauth-state',
    });

    expect(credential).toBeInstanceOf(Credential);
    expect(credential).toMatchObject({ url: 'https://provider.example/oauth' });

    expect(mockInstance.post).toHaveBeenCalledWith('verify', {
      code: 'oauth-code',
      state: 'oauth-state',
    });
  });

  it('reads Threads readiness beside the canonical connect route', async () => {
    const service = new ServicesService('threads', 'token');

    const readiness = await service.getConnectReadiness();

    expect(readiness).toEqual({ status: 'available' });

    expect(baseServiceConstructor).toHaveBeenCalledWith(
      '/services/threads',
      'token',
      expect.any(Function),
    );
    expect(mockInstance.get).toHaveBeenCalledWith('connect-readiness');
  });
  it('lists the Google Business locations a pending connection can choose', async () => {
    const locations = [
      {
        address: '1 High Street',
        id: 'accounts/1/locations/10',
        isAlreadyConnected: false,
        title: 'Corner Cafe',
      },
    ];
    mockInstance.get.mockResolvedValue({ data: { locations } });
    const service = new ServicesService('google-business', 'token');
    const signal = new AbortController().signal;

    const result = await service.getGoogleBusinessLocations('cred-1', signal);

    expect(result).toEqual(locations);
    expect(mockInstance.get).toHaveBeenCalledWith('cred-1/locations', {
      signal,
    });
  });

  it('connects the chosen Google Business locations and returns their credentials', async () => {
    mockInstance.post.mockResolvedValue({
      data: {
        data: [
          {
            attributes: { externalId: 'accounts/1/locations/10', id: 'c-1' },
            type: 'credential',
          },
        ],
      },
    });
    const service = new ServicesService('google-business', 'token');

    const result = await service.postSelectLocations('cred-1', [
      'accounts/1/locations/10',
    ]);

    expect(mockInstance.post).toHaveBeenCalledWith('cred-1/select-location', {
      locationIds: ['accounts/1/locations/10'],
    });
    expect(result).toHaveLength(1);
    expect(result[0]).toBeInstanceOf(Credential);
    expect(result[0]).toMatchObject({ externalId: 'accounts/1/locations/10' });
  });
});
