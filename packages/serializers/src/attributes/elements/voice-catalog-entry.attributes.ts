import { createEntityAttributes } from '@genfeedai/helpers';

/**
 * Attributes exposed on the wire for ExternalVoice catalog entries.
 *
 * Wire-format aliases for backward compatibility with existing frontend consumers:
 *   ExternalVoice.externalProvider → wire: 'provider'
 *   ExternalVoice.externalId       → wire: 'externalVoiceId'
 *   ExternalVoice.sampleAudioUrl   → wire: 'sampleAudioUrl'
 *
 * The controller normalizes ExternalVoice records to expose these wire names
 * before passing them to the serializer.
 */
export const voiceCatalogEntryAttributes = createEntityAttributes([
  'provider',
  'externalVoiceId',
  'name',
  'sampleAudioUrl',
  'language',
  'isActive',
  'isDefaultSelectable',
  'isFeatured',
  'providerData',
]);
