import { buildSingleSerializer, type BuiltSerializer } from '../../builders';
import { presignedUploadSerializerConfig } from '../../configs';

export const PresignedUploadSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  presignedUploadSerializerConfig,
);
