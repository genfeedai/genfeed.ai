import { buildSerializer } from '@serializers/builders';
import { outlierLibraryPostSerializerConfig } from '@serializers/configs/social/outlier-library-post.config';
export const { OutlierLibraryPostSerializer } = buildSerializer(
  'server',
  outlierLibraryPostSerializerConfig,
);
