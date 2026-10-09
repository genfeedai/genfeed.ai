import { avatarAttributes } from '@serializers/attributes/ingredients/avatar.attributes';
import { simpleConfig } from '@serializers/builders';
import { serializeGenerationEntry } from '@serializers/helpers/generation-entry.helper';

export const avatarSerializerConfig = {
  ...simpleConfig('avatar', avatarAttributes),
  attributeDerivations: { generationEntry: serializeGenerationEntry },
};
