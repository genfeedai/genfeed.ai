import { assetAttributes } from '@serializers/attributes/ingredients/asset.attributes';
import { organizationAttributes } from '@serializers/attributes/organizations/organization.attributes';
import { organizationSettingsAttributes } from '@serializers/attributes/organizations/organization-settings.attributes';
import { rel } from '@serializers/builders';

export const organizationSerializerConfig = {
  attributes: organizationAttributes,
  banner: rel('banner', assetAttributes),
  credits: rel('credit', ['balance', 'expiresAt', 'source', 'createdAt']),
  logo: rel('logo', assetAttributes),
  settings: rel('organization-settings', organizationSettingsAttributes),
  type: 'organization',
};
