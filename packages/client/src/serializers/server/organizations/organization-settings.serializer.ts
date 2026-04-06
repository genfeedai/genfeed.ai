import { type BuiltSerializer, buildSingleSerializer } from '../../builders';
import { organizationSettingsSerializerConfig } from '../../configs';

export const OrganizationSettingSerializer: BuiltSerializer =
  buildSingleSerializer('server', organizationSettingsSerializerConfig);
