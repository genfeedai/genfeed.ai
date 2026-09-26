import { mediaModerationAttributes } from '@serializers/attributes/content/media-moderation.attributes';
import { simpleConfig } from '@serializers/builders';

export const mediaModerationSerializerConfig = simpleConfig(
  'media-moderation',
  mediaModerationAttributes,
);
