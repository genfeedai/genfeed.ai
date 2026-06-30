import { AdminWarmupAccountsService } from '@services/admin/warmup-accounts.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGet = vi.fn();
const mockPost = vi.fn();

vi.mock('@services/core/json-api', () => ({
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
      ServiceClass: new (...args: never[]) => T,
      ...args: never[]
    ): T {
      return new ServiceClass(...args);
    }
  }

  return { HTTPBaseService: MockHTTPBaseService };
});

describe('AdminWarmupAccountsService', () => {
  let service: AdminWarmupAccountsService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AdminWarmupAccountsService('test-token');
  });

  it('deserializes warm-up account collections', async () => {
    mockGet.mockResolvedValue({
      data: {
        data: [
          {
            attributes: {
              leadEmail: 'lead@example.com',
              status: 'INVITED',
            },
            id: 'warmup-1',
          },
        ],
      },
    });

    await expect(service.getWarmupAccounts()).resolves.toEqual([
      {
        attributes: {
          leadEmail: 'lead@example.com',
          status: 'INVITED',
        },
        id: 'warmup-1',
      },
    ]);
  });

  it('posts create requests and deserializes the created resource', async () => {
    mockPost.mockResolvedValue({
      data: {
        data: {
          attributes: {
            leadEmail: 'founder@example.com',
            organizationName: 'Founder Co',
            status: 'INVITED',
          },
          id: 'warmup-2',
        },
      },
    });

    await expect(
      service.createWarmupAccount({
        brandName: 'Founder Brand',
        leadEmail: 'founder@example.com',
        organizationName: 'Founder Co',
      }),
    ).resolves.toEqual({
      id: 'warmup-2',
      leadEmail: 'founder@example.com',
      organizationName: 'Founder Co',
      status: 'INVITED',
    });
    expect(mockPost).toHaveBeenCalledWith('', {
      brandName: 'Founder Brand',
      leadEmail: 'founder@example.com',
      organizationName: 'Founder Co',
    });
  });
});
