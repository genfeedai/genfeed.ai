import { type BuiltSerializer, buildSingleSerializer } from '../../builders';
import { orgIntegrationSerializerConfig } from '../../configs';

export const OrgIntegrationSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  orgIntegrationSerializerConfig,
);
