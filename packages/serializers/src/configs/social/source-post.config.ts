import { sourcePostAttributes } from '@serializers/attributes/social/source-post.attributes';
import { simpleConfig } from '@serializers/builders';

export const sourcePostSerializerConfig = simpleConfig(
  'source-post',
  sourcePostAttributes,
);
