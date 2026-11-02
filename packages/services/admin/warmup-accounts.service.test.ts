import {
  installMockHttp,
  type MockHttpInstance,
} from '@services/__mocks__/http.mock';
import { AdminWarmupAccountsService } from '@services/admin/warmup-accounts.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('AdminWarmupAccountsService', () => {
  let service: AdminWarmupAccountsService;
  let http: MockHttpInstance;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AdminWarmupAccountsService('test-token');
    http = installMockHttp(service);
  });

  it('deserializes warm-up account collections', async () => {
    http.get.mockResolvedValue({
      data: {
        data: [
          {
            attributes: {
              leadEmail: 'lead@example.com',
              status: 'INVITED',
            },
            id: 'warmup-1',
            type: 'warmup-accounts',
          },
        ],
      },
    });

    await expect(service.getWarmupAccounts()).resolves.toEqual([
      {
        leadEmail: 'lead@example.com',
        status: 'INVITED',
        id: 'warmup-1',
      },
    ]);
  });

  it('forwards the requested page, limit and cancellation signal', async () => {
    http.get.mockResolvedValue({
      data: {
        data: [],
        links: { pagination: { limit: 10, page: 3, pages: 5, total: 42 } },
      },
    });
    const signal = new AbortController().signal;

    await expect(
      service.getWarmupAccounts({ limit: 10, page: 3 }, signal),
    ).resolves.toEqual([]);

    expect(http.get).toHaveBeenCalledWith('', {
      params: { limit: 10, page: 3 },
      signal,
    });
  });

  it('posts create requests and deserializes the created resource', async () => {
    http.post.mockResolvedValue({
      data: {
        data: {
          attributes: {
            leadEmail: 'founder@example.com',
            organizationName: 'Founder Co',
            status: 'INVITED',
          },
          id: 'warmup-2',
          type: 'warmup-accounts',
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
    expect(http.post).toHaveBeenCalledWith('', {
      brandName: 'Founder Brand',
      leadEmail: 'founder@example.com',
      organizationName: 'Founder Co',
    });
  });

  it('inspects, sends, resends, and revokes invitation lifecycle actions', async () => {
    const signal = new AbortController().signal;
    http.get.mockResolvedValue({
      data: {
        data: {
          attributes: {
            invitation: { id: 'invite-1', status: 'pending' },
            status: 'INVITED',
          },
          id: 'warmup-1',
          type: 'warmup-accounts',
        },
      },
    });
    http.post.mockResolvedValue({
      data: {
        data: {
          attributes: {
            invitation: { id: 'invite-1', status: 'delivered' },
            status: 'INVITED',
          },
          id: 'warmup-1',
          type: 'warmup-accounts',
        },
      },
    });

    await expect(
      service.inspectInvitation('warmup-1', signal),
    ).resolves.toEqual({
      id: 'warmup-1',
      invitation: { id: 'invite-1', status: 'pending' },
      status: 'INVITED',
    });
    expect(http.get).toHaveBeenCalledWith('/warmup-1/invitation', { signal });

    await expect(
      service.sendInvitation('warmup-1', signal),
    ).resolves.toMatchObject({
      invitation: { status: 'delivered' },
    });
    expect(http.post).toHaveBeenCalledWith(
      '/warmup-1/invitation/send',
      undefined,
      { signal },
    );

    await expect(
      service.resendInvitation('warmup-1', signal),
    ).resolves.toMatchObject({ invitation: { status: 'delivered' } });
    expect(http.post).toHaveBeenCalledWith(
      '/warmup-1/invitation/resend',
      undefined,
      { signal },
    );

    http.post.mockResolvedValueOnce({
      data: {
        data: {
          id: 'warmup-1',
          type: 'warmup-accounts',
          attributes: {
            status: 'INVITED',
            invitation: { id: 'invite-1', status: 'revoked' },
          },
        },
      },
    });
    await expect(
      service.revokeInvitation('warmup-1', signal),
    ).resolves.toMatchObject({ invitation: { status: 'revoked' } });
    expect(http.post).toHaveBeenCalledWith(
      '/warmup-1/invitation/revoke',
      undefined,
      { signal },
    );
  });
});
