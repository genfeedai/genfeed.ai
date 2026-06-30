import { templateAttributes } from '@serializers/attributes/content/template.attributes';
import { templateMetadataAttributes } from '@serializers/attributes/content/template-metadata.attributes';

export const templateSerializerConfig = {
  attributes: templateAttributes,
  relationships: {
    metadata: {
      attributes: templateMetadataAttributes,
      type: 'template-metadata',
    },
  },
  type: 'template',
};
