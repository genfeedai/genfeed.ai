import { buildSerializer } from '@serializers/builders';
import {
  contentPreviewSerializerConfig,
  publicContentPreviewSerializerConfig,
} from '@serializers/configs/content/content-preview.config';

export const { ContentPreviewSerializer } = buildSerializer(
  'server',
  contentPreviewSerializerConfig,
);

export const { PublicContentPreviewSerializer } = buildSerializer(
  'server',
  publicContentPreviewSerializerConfig,
);
