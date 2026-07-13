import { dashboardLayoutAttributes } from '@serializers/attributes/content/dashboard-layout.attributes';
import { simpleConfig } from '@serializers/builders';

export const dashboardLayoutSerializerConfig = simpleConfig(
  'dashboard-layout',
  dashboardLayoutAttributes,
);
