import { InvitationsController } from '@api/collections/members/controllers/invitations.controller';
import type { InvitationService } from '@api/collections/members/services/invitation.service';
import { BadRequestException } from '@nestjs/common';
import type { Response } from 'express';

const acceptResult = {
  invitation: {
    acceptedAt: new Date('2026-06-23T12:00:00.000Z'),
    createdAt: new Date('2026-06-22T12:00:00.000Z'),
    email: 'new@example.com',
    expiresAt: new Date('2026-06-30T12:00:00.000Z'),
    id: 'inv_123',
    invitedByUserId: 'user_123',
    organizationId: 'org_123',
    revokedAt: null,
    roleId: 'role_user',
    status: 'accepted' as const,
    updatedAt: new Date('2026-06-23T12:00:00.000Z'),
  },
  memberId: 'member_123',
  organizationId: 'org_123',
  redirectUrl: 'https://app.test/login?invitation=accepted&org=org_123',
  userId: 'user_123',
};

const invitationService = {
  acceptInvitation: vi.fn(),
} as unknown as InvitationService;

function buildController() {
  return new InvitationsController(invitationService);
}

describe('InvitationsController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('accepts an invitation and redirects to the resolved URL', async () => {
    const controller = buildController();
    vi.mocked(invitationService.acceptInvitation).mockResolvedValue(
      acceptResult,
    );
    const response = {
      redirect: vi.fn(),
    } as unknown as Response;

    await controller.acceptInvitationRedirect('token-123', response);

    expect(invitationService.acceptInvitation).toHaveBeenCalledWith(
      'token-123',
    );
    expect(response.redirect).toHaveBeenCalledWith(
      303,
      acceptResult.redirectUrl,
    );
  });

  it('accepts an invitation and returns a JSON result', async () => {
    const controller = buildController();
    vi.mocked(invitationService.acceptInvitation).mockResolvedValue(
      acceptResult,
    );

    const result = await controller.acceptInvitation('token-123');

    expect(result).toEqual({ data: acceptResult });
  });

  it('rejects blank tokens before calling the service', async () => {
    const controller = buildController();

    await expect(controller.acceptInvitation('   ')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(invitationService.acceptInvitation).not.toHaveBeenCalled();
  });
});
