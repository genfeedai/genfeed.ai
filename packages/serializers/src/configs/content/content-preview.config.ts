import {
  contentPreviewAttributes,
  publicContentPreviewAttributes,
} from '@serializers/attributes/content/content-preview.attributes';
import { simpleConfig } from '@serializers/builders';

export const contentPreviewSerializerConfig = simpleConfig(
  'content-preview',
  contentPreviewAttributes,
);

export const publicContentPreviewSerializerConfig = simpleConfig(
  'public-content-preview',
  publicContentPreviewAttributes,
);
