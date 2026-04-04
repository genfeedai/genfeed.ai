import { trendAttributes } from '@serializers/attributes/collections/trend.attributes';
import { simpleConfig } from '@serializers/builders';

export const trendSerializerConfig = simpleConfig('trend', trendAttributes);
