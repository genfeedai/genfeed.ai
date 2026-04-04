import { voiceCatalogEntryAttributes } from '@serializers/attributes/elements/voice-catalog-entry.attributes';
import { simpleConfig } from '@serializers/builders';

export const voiceCatalogEntrySerializerConfig = simpleConfig(
  'voice-catalog-entry',
  voiceCatalogEntryAttributes,
);
