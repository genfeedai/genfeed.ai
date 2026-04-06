import { type BuiltSerializer, buildSingleSerializer } from '../../builders';
import { knowledgeBaseSerializerConfig } from '../../configs';

export const KnowledgeBaseSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  knowledgeBaseSerializerConfig,
);
