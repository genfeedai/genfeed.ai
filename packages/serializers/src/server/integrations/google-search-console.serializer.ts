import { buildSerializer } from '@serializers/builders';
import {
  googleSearchConsoleSearchAnalyticsSerializerConfig,
  googleSearchConsoleSiteSerializerConfig,
} from '@serializers/configs';

export const { GoogleSearchConsoleSiteSerializer } = buildSerializer(
  'server',
  googleSearchConsoleSiteSerializerConfig,
);

export const { GoogleSearchConsoleSearchAnalyticsSerializer } = buildSerializer(
  'server',
  googleSearchConsoleSearchAnalyticsSerializerConfig,
);
