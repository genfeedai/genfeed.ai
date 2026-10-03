import {
  skillVersionMetadataAttributes,
  skillVersionReadAttributes,
} from '@serializers/attributes/content/content-skill-version.attributes';

export const skillVersionMetadataSerializerConfig = {
  attributes: skillVersionMetadataAttributes,
  type: 'skill-version',
};
export const skillVersionReadSerializerConfig = {
  attributes: skillVersionReadAttributes,
  type: 'skill-version',
};
