import { buildSerializer } from '@serializers/builders';
import { releaseAttachmentSerializerConfig } from '@serializers/configs';

export const { ReleaseAttachmentSerializer } = buildSerializer(
  'server',
  releaseAttachmentSerializerConfig,
);
