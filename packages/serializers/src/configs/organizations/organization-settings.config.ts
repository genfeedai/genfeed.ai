import { organizationSettingsAttributes } from '@serializers/attributes/organizations/organization-settings.attributes';
import { simpleConfig } from '@serializers/builders';

export const organizationSettingsSerializerConfig = simpleConfig(
  'organization-setting',
  organizationSettingsAttributes,
);
