import { buildSerializer } from '@serializers/builders';
import { gifSerializerConfig } from '@serializers/configs';

export const { GifSerializer } = buildSerializer('server', gifSerializerConfig);
