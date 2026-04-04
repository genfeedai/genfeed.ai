import { buildSerializer } from '@serializers/builders';
import { presignedUploadSerializerConfig } from '@serializers/configs';

export const { PresignedUploadSerializer } = buildSerializer(
  'server',
  presignedUploadSerializerConfig,
);
