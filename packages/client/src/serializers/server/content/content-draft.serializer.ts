import { buildSingleSerializer, type BuiltSerializer } from '../../builders';
import { contentDraftSerializerConfig } from '../../configs';

export const ContentDraftSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  contentDraftSerializerConfig,
);
