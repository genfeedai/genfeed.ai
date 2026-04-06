import { type BuiltSerializer, buildSingleSerializer } from '../../builders';
import { crmSendInvitationResultSerializerConfig } from '../../configs';

export const CrmSendInvitationResultSerializer: BuiltSerializer =
  buildSingleSerializer('server', crmSendInvitationResultSerializerConfig);
