import { buildSerializer } from '@serializers/builders';
import { knowledgeSourceVersionSerializerConfig } from '@serializers/configs';

export const { KnowledgeSourceVersionSerializer } = buildSerializer(
  'server',
  knowledgeSourceVersionSerializerConfig,
);
