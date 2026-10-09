import { voiceAttributes } from '@serializers/attributes/elements/voice.attributes';
import { simpleConfig } from '@serializers/builders';
import {
  sanitizeGenerationEntryProviderData,
  serializeGenerationEntry,
} from '@serializers/helpers/generation-entry.helper';

export const voiceSerializerConfig = {
  ...simpleConfig('voice', voiceAttributes),
  attributeTransforms: { providerData: sanitizeGenerationEntryProviderData },
  attributeDerivations: { generationEntry: serializeGenerationEntry },
};
