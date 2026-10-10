import { turboRunAttributes } from '@serializers/attributes/content/turbo-run.attributes';
import { STANDARD_ENTITY_RELS } from '@serializers/relationships';

export const turboRunSerializerConfig = {
  attributes: turboRunAttributes,
  type: 'turbo-run',
  ...STANDARD_ENTITY_RELS,
};
