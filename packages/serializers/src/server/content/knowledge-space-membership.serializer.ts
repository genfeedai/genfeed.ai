import { buildSerializer } from '@serializers/builders';
import { knowledgeSpaceMembershipSerializerConfig } from '@serializers/configs';

export const { KnowledgeSpaceMembershipSerializer } = buildSerializer(
  'server',
  knowledgeSpaceMembershipSerializerConfig,
);
