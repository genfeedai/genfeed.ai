import { buildSerializer } from '@serializers/builders';
import { memberInvitationSerializerConfig } from '@serializers/configs';

export const { MemberInvitationSerializer } = buildSerializer(
  'server',
  memberInvitationSerializerConfig,
);
