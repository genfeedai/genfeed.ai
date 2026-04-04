import { buildSingleSerializer, type BuiltSerializer } from '../../builders';
import {
  postAnalyticsSerializerConfig,
  postSerializerConfig,
} from '../../configs';

export const PostSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  postSerializerConfig,
);

export const PostAnalyticsSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  postAnalyticsSerializerConfig,
);
