import { contentPerformanceAttributes } from '@serializers/attributes/content/content-performance.attributes';
import { postAttributes } from '@serializers/attributes/content/post.attributes';
import { rel } from '@serializers/builders';
import {
  BRAND_MINIMAL_REL,
  ORGANIZATION_MINIMAL_REL,
  USER_REL,
} from '@serializers/relationships';

export const contentPerformanceSerializerConfig = {
  attributes: contentPerformanceAttributes,
  brand: BRAND_MINIMAL_REL,
  organization: ORGANIZATION_MINIMAL_REL,
  post: rel('post', postAttributes),
  type: 'content-performance',
  user: USER_REL,
};
