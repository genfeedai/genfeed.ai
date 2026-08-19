import {
  postingSetAttributes,
  postingSignatureAttributes,
} from '@serializers/attributes/content/posting-set.attributes';
import {
  BRAND_MINIMAL_REL,
  ORGANIZATION_MINIMAL_REL,
  USER_REL,
} from '@serializers/relationships';

export const postingSetSerializerConfig = {
  attributes: postingSetAttributes,
  brand: BRAND_MINIMAL_REL,
  organization: ORGANIZATION_MINIMAL_REL,
  type: 'posting-set',
  user: USER_REL,
};

export const postingSignatureSerializerConfig = {
  attributes: postingSignatureAttributes,
  brand: BRAND_MINIMAL_REL,
  organization: ORGANIZATION_MINIMAL_REL,
  type: 'posting-signature',
  user: USER_REL,
};
