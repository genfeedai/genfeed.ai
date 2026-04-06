import { type BuiltSerializer, buildSingleSerializer } from '../../builders';
import { contentDraftSerializerConfig } from '../../configs';

export const ContentDraftSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  contentDraftSerializerConfig,
);
