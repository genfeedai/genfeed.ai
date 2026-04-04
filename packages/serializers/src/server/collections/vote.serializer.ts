import { buildSerializer } from '@serializers/builders';
import { voteSerializerConfig } from '@serializers/configs';

export const { VoteSerializer } = buildSerializer(
  'server',
  voteSerializerConfig,
);
