import { simpleConfig } from '@serializers/builders';

export const memberInvitationSerializerConfig = simpleConfig(
  'member-invitation',
  ['email', 'firstName', 'lastName', 'role'],
);
