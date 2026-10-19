import {
  axiosResponse,
  collectionDocument,
  installMockHttp,
  type MockHttpInstance,
  resourceDocument,
} from '@services/__mocks__/http.mock';
import { MembersService } from '@services/organization/members.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('MembersService invitation HTTP methods', () => {
  let service: MembersService;
  let http: MockHttpInstance;

  beforeEach(() => {
    vi.restoreAllMocks();
    service = new MembersService('member-token');
    http = installMockHttp(service);
  });

  it('lists invitation lifecycle states', async () => {
    http.get.mockResolvedValue(
      axiosResponse(
        collectionDocument([
          {
            email: 'invitee@example.com',
            id: 'inv_1',
            roleKey: 'admin',
            status: 'delivery-failed',
          },
        ]),
      ),
    );

    const result = await service.listInvitations('delivery-failed');

    expect(http.get).toHaveBeenCalledWith('/invitations', {
      params: { limit: 100, page: 1, status: 'delivery-failed' },
    });
    expect(result).toEqual([
      expect.objectContaining({
        email: 'invitee@example.com',
        id: 'inv_1',
        roleKey: 'admin',
        status: 'delivery-failed',
      }),
    ]);
  });

  it('walks every invitation page', async () => {
    const withPages = (id: string, page: number) => ({
      ...collectionDocument([{ email: `${id}@example.com`, id }]),
      links: { pagination: { limit: 100, page, pages: 2, total: 101 } },
    });
    http.get
      .mockResolvedValueOnce(axiosResponse(withPages('inv_1', 1)))
      .mockResolvedValueOnce(axiosResponse(withPages('inv_2', 2)));

    const result = await service.listInvitations();

    expect(result.map((invitation) => invitation.id)).toEqual([
      'inv_1',
      'inv_2',
    ]);
    expect(http.get).toHaveBeenNthCalledWith(2, '/invitations', {
      params: { limit: 100, page: 2 },
    });
  });

  it('retries delivery on the existing invitation resource', async () => {
    http.post.mockResolvedValue(
      axiosResponse(
        resourceDocument(
          { email: 'invitee@example.com', status: 'delivered' },
          { id: 'inv_1' },
        ),
      ),
    );

    const result = await service.resendInvitation('inv_1');

    expect(http.post).toHaveBeenCalledWith('/invitations/inv_1/resend');
    expect(result).toMatchObject({ id: 'inv_1', status: 'delivered' });
  });

  it('revokes an invitation resource', async () => {
    http.delete.mockResolvedValue(
      axiosResponse(
        resourceDocument(
          { email: 'invitee@example.com', status: 'revoked' },
          { id: 'inv_1' },
        ),
      ),
    );

    const result = await service.revokeInvitation('inv_1');

    expect(http.delete).toHaveBeenCalledWith('/invitations/inv_1');
    expect(result).toMatchObject({ id: 'inv_1', status: 'revoked' });
  });
});

describe('MembersService app installation HTTP methods (#5502)', () => {
  let service: MembersService;
  let http: MockHttpInstance;

  beforeEach(() => {
    vi.restoreAllMocks();
    service = new MembersService('member-token');
    http = installMockHttp(service);
  });

  it('reads the caller installations and drops unknown ids', async () => {
    const controller = new AbortController();
    http.get.mockResolvedValue(
      axiosResponse({ installedAppIds: ['turbo', 'retired', 'clips'] }),
    );

    await expect(service.findMyApps(controller.signal)).resolves.toEqual([
      'turbo',
      'clips',
    ]);
    expect(http.get).toHaveBeenCalledWith('/me/apps', {
      signal: controller.signal,
    });
  });

  it('installs and uninstalls one app at a time', async () => {
    http.put.mockResolvedValue(
      axiosResponse({ installedAppIds: ['playground', 'turbo'] }),
    );
    http.delete.mockResolvedValue(
      axiosResponse({ installedAppIds: ['playground'] }),
    );

    await expect(service.installApp('turbo')).resolves.toEqual([
      'playground',
      'turbo',
    ]);
    await expect(service.uninstallApp('turbo')).resolves.toEqual([
      'playground',
    ]);
    expect(http.put).toHaveBeenCalledWith('/me/apps/turbo');
    expect(http.delete).toHaveBeenCalledWith('/me/apps/turbo');
  });
});
