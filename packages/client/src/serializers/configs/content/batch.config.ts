import { batchAttributes } from '../../attributes/content/batch.attributes';
import { STANDARD_ENTITY_RELS } from '../../relationships';

export const batchSerializerConfig = {
  attributes: batchAttributes,
  type: 'batch',
  ...STANDARD_ENTITY_RELS,
};
