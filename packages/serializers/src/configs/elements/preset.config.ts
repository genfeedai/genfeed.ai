import { presetAttributes } from '@serializers/attributes/elements/preset.attributes';
import { simpleConfig } from '@serializers/builders';

export const presetSerializerConfig = simpleConfig('preset', presetAttributes);
