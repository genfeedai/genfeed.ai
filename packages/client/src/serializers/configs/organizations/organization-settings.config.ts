import { organizationSettingsAttributes } from '../../attributes/organizations/organization-settings.attributes';
import { simpleConfig } from '../../builders';

export const organizationSettingsSerializerConfig = simpleConfig(
  'organization-setting',
  organizationSettingsAttributes,
);
