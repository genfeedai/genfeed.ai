import { buildSingleSerializer, type BuiltSerializer } from '../../builders';
import { voteSerializerConfig } from '../../configs';

export const VoteSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  voteSerializerConfig,
);
