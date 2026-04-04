import { contentDraftAttributes } from '@serializers/attributes/content/content-draft.attributes';
import {
  BRAND_MINIMAL_REL,
  ORGANIZATION_MINIMAL_REL,
} from '@serializers/relationships';

export const contentDraftSerializerConfig = {
  attributes: contentDraftAttributes,
  brand: BRAND_MINIMAL_REL,
  organization: ORGANIZATION_MINIMAL_REL,
  type: 'content-draft',
};
