import { InvitationsController } from '@api/collections/members/controllers/invitations.controller';
import type { InvitationService } from '@api/collections/members/services/invitation.service';
import { GoneException } from '@nestjs/common';
import type { Response } from 'express';

type Invitation = { organizationId: string; status: string };

/**
 * Invitations by token. Accepting a pending one marks it accepted; any other
 * status is gone with the service's message for it.
 */
function buildController(invitations: Record<string, Invitation>) {
  const goneMessages: Record<string, string> = {
    accepted: 'Invitation has already been accepted',
    expired: 'Invitation has expired',
    revoked: 'Invitation has been revoked',
  };
  const service = {
    acceptInvitation: async (token: string) => {
      const invitation = invitations[token];
      if (invitation.status !== 'pending') {
        throw new GoneException(goneMessages[invitation.status]);
      }
      invitation.status = 'accepted';
      return {
        redirectUrl: `https://app.test/login?invitation=accepted&org=${invitation.organizationId}`,
      };
    },
    resolveInvitationOutcomeRedirectUrl: (outcome: string) =>
      `https://app.test/login?invitation=${outcome}`,
  };
  return new InvitationsController(service as unknown as InvitationService);
}

/** An express response that keeps the redirects it was asked for. */
function recordingResponse() {
  const redirects: { status: number; url: string }[] = [];
  const response = {
    redirect: (status: number, url: string) => redirects.push({ status, url }),
  } as unknown as Response;
  return { redirects, response };
}

describe('InvitationsController', () => {
  it('accepts an invitation and redirects to the resolved URL', async () => {
    const invitations = {
      'token-123': { organizationId: 'org_123', status: 'pending' },
    };
    const { redirects, response } = recordingResponse();

    await buildController(invitations).acceptInvitationRedirect(
      'token-123',
      response,
    );

    expect(invitations['token-123'].status).toBe('accepted');
    expect(redirects).toEqual([
      {
        status: 303,
        url: 'https://app.test/login?invitation=accepted&org=org_123',
      },
    ]);
  });

  it('redirects blank tokens to a recoverable invalid state', async () => {
    const { redirects, response } = recordingResponse();

    await buildController({}).acceptInvitationRedirect('   ', response);

    expect(redirects).toEqual([
      { status: 303, url: 'https://app.test/login?invitation=invalid' },
    ]);
  });

  it.each([
    ['accepted', 'already-accepted'],
    ['expired', 'expired'],
    ['revoked', 'revoked'],
  ])(
    'redirects an invitation that is %s to the %s recovery state',
    async (status, outcome) => {
      const { redirects, response } = recordingResponse();

      await buildController({
        'token-123': { organizationId: 'org_123', status },
      }).acceptInvitationRedirect('token-123', response);

      expect(redirects).toEqual([
        { status: 303, url: `https://app.test/login?invitation=${outcome}` },
      ]);
    },
  );
});
