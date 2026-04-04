import { buildSerializer } from '@serializers/builders';
import { runSerializerConfig } from '@serializers/configs';

export const { RunSerializer } = buildSerializer('server', runSerializerConfig);
