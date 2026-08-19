import { postingCadenceAttributes } from '@serializers/attributes/content/posting-cadence.attributes';
import { STANDARD_ENTITY_RELS } from '@serializers/relationships';

export const postingCadenceSerializerConfig = {
  attributes: postingCadenceAttributes,
  type: 'posting-cadence',
  ...STANDARD_ENTITY_RELS,
};
