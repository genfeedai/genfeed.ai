import { buildSerializer } from '@serializers/builders';
import { tagSerializerConfig } from '@serializers/configs';

export const { TagSerializer } = buildSerializer('server', tagSerializerConfig);
