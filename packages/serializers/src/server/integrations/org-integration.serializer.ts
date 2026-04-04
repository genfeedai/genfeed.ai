import { buildSerializer } from '@serializers/builders';
import { orgIntegrationSerializerConfig } from '@serializers/configs';

export const { OrgIntegrationSerializer } = buildSerializer(
  'server',
  orgIntegrationSerializerConfig,
);
