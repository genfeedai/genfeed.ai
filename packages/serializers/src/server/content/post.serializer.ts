import { buildSerializer } from '@serializers/builders';
import {
  postAnalyticsSerializerConfig,
  postSerializerConfig,
} from '@serializers/configs';

export const { PostSerializer } = buildSerializer(
  'server',
  postSerializerConfig,
);

export const { PostAnalyticsSerializer } = buildSerializer(
  'server',
  postAnalyticsSerializerConfig,
);
