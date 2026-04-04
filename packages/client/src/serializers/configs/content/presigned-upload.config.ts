import { presignedUploadAttributes } from '../../attributes/content/presigned-upload.attributes';
import { simpleConfig } from '../../builders';

export const presignedUploadSerializerConfig = simpleConfig(
  'presigned-upload',
  presignedUploadAttributes,
);
