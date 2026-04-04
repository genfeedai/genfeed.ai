import { buildSerializer } from '@serializers/builders';
import { crmSendInvitationResultSerializerConfig } from '@serializers/configs';

export const { CrmSendInvitationResultSerializer } = buildSerializer(
  'server',
  crmSendInvitationResultSerializerConfig,
);
