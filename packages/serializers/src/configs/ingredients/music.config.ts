import { musicAttributes } from '@serializers/attributes/ingredients/music.attributes';
import { simpleConfig } from '@serializers/builders';
import { serializeGenerationEntry } from '@serializers/helpers/generation-entry.helper';

export const musicSerializerConfig = {
  ...simpleConfig('music', musicAttributes),
  attributeDerivations: { generationEntry: serializeGenerationEntry },
};
