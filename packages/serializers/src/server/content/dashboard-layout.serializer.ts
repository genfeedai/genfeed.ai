import { buildSerializer } from '@serializers/builders';
import { dashboardLayoutSerializerConfig } from '@serializers/configs';

export const { DashboardLayoutSerializer } = buildSerializer(
  'server',
  dashboardLayoutSerializerConfig,
);
