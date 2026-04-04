import {
  type BuiltSerializer,
  buildSingleSerializer,
  folderSerializerConfig,
  knowledgeBaseSerializerConfig,
  promptSerializerConfig,
  tagSerializerConfig,
} from '..';

// Build all management serializers
export const FolderSerializer: BuiltSerializer = buildSingleSerializer(
  'client',
  folderSerializerConfig,
);
export const KnowledgeBaseSerializer: BuiltSerializer = buildSingleSerializer(
  'client',
  knowledgeBaseSerializerConfig,
);
export const PromptSerializer: BuiltSerializer = buildSingleSerializer(
  'client',
  promptSerializerConfig,
);
export const TagSerializer: BuiltSerializer = buildSingleSerializer(
  'client',
  tagSerializerConfig,
);
