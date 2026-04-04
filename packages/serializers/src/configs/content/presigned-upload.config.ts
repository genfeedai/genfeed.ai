import { presignedUploadAttributes } from '@serializers/attributes/content/presigned-upload.attributes';
import { simpleConfig } from '@serializers/builders';

export const presignedUploadSerializerConfig = simpleConfig(
  'presigned-upload',
  presignedUploadAttributes,
);
