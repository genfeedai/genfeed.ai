import { adInsightAttributes } from '@serializers/attributes/collections/ad-insight.attributes';
import { simpleConfig } from '@serializers/builders';

export const adInsightSerializerConfig = simpleConfig(
  'ad-insight',
  adInsightAttributes,
);
