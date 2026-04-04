import { buildSingleSerializer, type BuiltSerializer } from '../../builders';
import { organizationSettingsSerializerConfig } from '../../configs';

export const OrganizationSettingSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  organizationSettingsSerializerConfig,
);
