import { soundAttributes } from '@serializers/attributes/elements/sound.attributes';
import { simpleConfig } from '@serializers/builders';

export const soundSerializerConfig = simpleConfig('sound', soundAttributes);
