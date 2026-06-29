import {
  googleSearchConsoleSearchAnalyticsAttributes,
  googleSearchConsoleSiteAttributes,
} from '@serializers/attributes/integrations/google-search-console.attributes';
import { simpleConfig } from '@serializers/builders';

export const googleSearchConsoleSiteSerializerConfig = simpleConfig(
  'google-search-console-site',
  googleSearchConsoleSiteAttributes,
);

export const googleSearchConsoleSearchAnalyticsSerializerConfig = simpleConfig(
  'google-search-console-search-analytics',
  googleSearchConsoleSearchAnalyticsAttributes,
);
