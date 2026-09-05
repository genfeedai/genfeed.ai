import { buildSerializer } from '@serializers/builders';
import { knowledgeSpaceSerializerConfig } from '@serializers/configs';

export const { KnowledgeSpaceSerializer } = buildSerializer(
  'server',
  knowledgeSpaceSerializerConfig,
);
