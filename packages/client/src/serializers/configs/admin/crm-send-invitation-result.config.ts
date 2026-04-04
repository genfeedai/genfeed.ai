import { crmSendInvitationResultAttributes } from '../../attributes/admin/crm-send-invitation-result.attributes';
import { simpleConfig } from '../../builders';

export const crmSendInvitationResultSerializerConfig = simpleConfig(
  'crm-send-invitation-result',
  crmSendInvitationResultAttributes,
);
