import { libraryElementAttributes } from '@serializers/attributes/content/library-element.attributes';
import { STANDARD_ENTITY_RELS } from '@serializers/relationships';

export const libraryElementSerializerConfig = {
  attributes: libraryElementAttributes,
  type: 'library-element',
  ...STANDARD_ENTITY_RELS,
};
