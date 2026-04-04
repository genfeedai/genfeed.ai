import { templateAttributes } from '@serializers/attributes/content/template.attributes';
import { templateMetadataAttributes } from '@serializers/attributes/content/template-metadata.attributes';
import { simpleConfig } from '@serializers/builders';

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

export const templateMetadataSerializerConfig = simpleConfig(
  'template-metadata',
  templateMetadataAttributes,
);
