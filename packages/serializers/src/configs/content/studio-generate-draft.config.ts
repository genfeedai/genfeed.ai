import { studioGenerateDraftAttributes } from '@serializers/attributes/content/studio-generate-draft.attributes';
import { simpleConfig } from '@serializers/builders';

export const studioGenerateDraftSerializerConfig = simpleConfig(
  'studio-generate-draft',
  studioGenerateDraftAttributes,
);
