import { buildSingleSerializer, type BuiltSerializer } from '../../builders';
import { knowledgeBaseSerializerConfig } from '../../configs';

export const KnowledgeBaseSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  knowledgeBaseSerializerConfig,
);
