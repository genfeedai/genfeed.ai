import { buildSerializer } from '@serializers/builders';
import { threadMessageSerializerConfig } from '@serializers/configs';

const { ThreadMessageSerializer } = buildSerializer(
  'server',
  threadMessageSerializerConfig,
);

export { ThreadMessageSerializer };
