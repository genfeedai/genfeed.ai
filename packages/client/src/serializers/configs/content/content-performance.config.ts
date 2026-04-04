import { contentPerformanceAttributes } from '../../attributes/content/content-performance.attributes';
import { postAttributes } from '../../attributes/content/post.attributes';
import { rel } from '../../builders';
import {
  BRAND_MINIMAL_REL,
  ORGANIZATION_MINIMAL_REL,
  USER_REL,
} from '../../relationships';

export const contentPerformanceSerializerConfig = {
  attributes: contentPerformanceAttributes,
  brand: BRAND_MINIMAL_REL,
  organization: ORGANIZATION_MINIMAL_REL,
  post: rel('post', postAttributes),
  type: 'content-performance',
  user: USER_REL,
};
