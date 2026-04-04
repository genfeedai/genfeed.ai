import { crmSendInvitationResultAttributes } from '@serializers/attributes/admin/crm-send-invitation-result.attributes';
import { simpleConfig } from '@serializers/builders';

export const crmSendInvitationResultSerializerConfig = simpleConfig(
  'crm-send-invitation-result',
  crmSendInvitationResultAttributes,
);
