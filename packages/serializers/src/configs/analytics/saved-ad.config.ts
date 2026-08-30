import { savedAdAttributes } from '@serializers/attributes/analytics/saved-ad.attributes';
import { simpleConfig } from '@serializers/builders';

export const savedAdSerializerConfig = simpleConfig(
  'saved-ad',
  savedAdAttributes,
);
