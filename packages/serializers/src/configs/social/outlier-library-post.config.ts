import { outlierLibraryPostAttributes } from '@serializers/attributes/social/outlier-library-post.attributes';
import { simpleConfig } from '@serializers/builders';
export const outlierLibraryPostSerializerConfig = simpleConfig(
  'outlier-library-post',
  outlierLibraryPostAttributes,
);
