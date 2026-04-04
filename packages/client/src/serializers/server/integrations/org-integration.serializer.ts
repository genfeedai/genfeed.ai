import { buildSingleSerializer, type BuiltSerializer } from '../../builders';
import { orgIntegrationSerializerConfig } from '../../configs';

export const OrgIntegrationSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  orgIntegrationSerializerConfig,
);
