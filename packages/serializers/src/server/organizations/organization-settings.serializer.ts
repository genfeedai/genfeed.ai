import { buildSerializer } from '@serializers/builders';
import { organizationSettingsSerializerConfig } from '@serializers/configs';

export const { OrganizationSettingSerializer } = buildSerializer(
  'server',
  organizationSettingsSerializerConfig,
);
