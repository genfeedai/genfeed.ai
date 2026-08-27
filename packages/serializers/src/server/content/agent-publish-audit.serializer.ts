import { buildSerializer } from '@serializers/builders';
import { agentPublishAuditSerializerConfig } from '@serializers/configs';

export const { AgentPublishAuditSerializer } = buildSerializer(
  'server',
  agentPublishAuditSerializerConfig,
);
