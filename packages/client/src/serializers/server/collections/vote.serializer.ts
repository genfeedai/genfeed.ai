import { type BuiltSerializer, buildSingleSerializer } from '../../builders';
import { voteSerializerConfig } from '../../configs';

export const VoteSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  voteSerializerConfig,
);
