import { rssSourceAttributes } from '@serializers/attributes/content/rss-source.attributes';
import {
  BRAND_MINIMAL_REL,
  ORGANIZATION_MINIMAL_REL,
  USER_REL,
} from '@serializers/relationships';

export const rssSourceSerializerConfig = {
  attributes: rssSourceAttributes,
  brand: BRAND_MINIMAL_REL,
  organization: ORGANIZATION_MINIMAL_REL,
  type: 'rss-source',
  user: USER_REL,
};
