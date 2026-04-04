import { buildSingleSerializer, type BuiltSerializer } from '../../builders';
import { crmSendInvitationResultSerializerConfig } from '../../configs';

export const CrmSendInvitationResultSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  crmSendInvitationResultSerializerConfig,
);
