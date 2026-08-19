import { buildSerializer } from '@serializers/builders';
import { postingCadenceSerializerConfig } from '@serializers/configs';

export const { PostingCadenceSerializer } = buildSerializer(
  'server',
  postingCadenceSerializerConfig,
);
