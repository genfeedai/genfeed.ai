import { buildSerializer } from '@serializers/builders';
import {
  postAnalyticsSerializerConfig,
  postListSerializerConfig,
  postSerializerConfig,
} from '@serializers/configs';

export const { PostSerializer } = buildSerializer(
  'server',
  postSerializerConfig,
);

export const { PostListSerializer } = buildSerializer(
  'server',
  postListSerializerConfig,
);

export const { PostAnalyticsSerializer } = buildSerializer(
  'server',
  postAnalyticsSerializerConfig,
);
