import { buildSerializer } from '@serializers/builders';
import {
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
