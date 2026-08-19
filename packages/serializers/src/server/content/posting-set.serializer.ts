import { buildSerializer } from '@serializers/builders';
import {
  postingSetSerializerConfig,
  postingSignatureSerializerConfig,
} from '@serializers/configs';

export const { PostingSetSerializer } = buildSerializer(
  'server',
  postingSetSerializerConfig,
);

export const { PostingSignatureSerializer } = buildSerializer(
  'server',
  postingSignatureSerializerConfig,
);
