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
      params: { status: 'delivery-failed' },
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
