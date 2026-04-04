import { voiceCatalogEntryAttributes } from '../../attributes/elements/voice-catalog-entry.attributes';
import { simpleConfig } from '../../builders';

export const voiceCatalogEntrySerializerConfig = simpleConfig(
  'voice-catalog-entry',
  voiceCatalogEntryAttributes,
);
