import { musicAttributes } from '@serializers/attributes/ingredients/music.attributes';
import { simpleConfig } from '@serializers/builders';

export const musicSerializerConfig = simpleConfig('music', musicAttributes);
