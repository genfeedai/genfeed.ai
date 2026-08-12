import { simpleConfig } from '@serializers/builders';

export const memberInvitationSerializerConfig = simpleConfig(
  'member-invitation',
  [
    'email',
    'firstName',
    'lastName',
    'organizationId',
    'invitedByUserId',
    'roleId',
    'roleKey',
    'status',
    'redirectUrl',
    'expiresAt',
    'acceptedAt',
    'revokedAt',
    'createdAt',
    'updatedAt',
  ],
);
