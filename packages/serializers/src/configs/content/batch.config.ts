import { batchAttributes } from '@serializers/attributes/content/batch.attributes';
import { STANDARD_ENTITY_RELS } from '@serializers/relationships';

export const batchSerializerConfig = {
  attributes: batchAttributes,
  type: 'batch',
  ...STANDARD_ENTITY_RELS,
};
