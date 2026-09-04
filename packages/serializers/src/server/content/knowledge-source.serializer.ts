import { buildSerializer } from '@serializers/builders';
import { knowledgeSourceSerializerConfig } from '@serializers/configs';

export const { KnowledgeSourceSerializer } = buildSerializer(
  'server',
  knowledgeSourceSerializerConfig,
);
