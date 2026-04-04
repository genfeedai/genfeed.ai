import {
  assetSerializerConfig,
  avatarSerializerConfig,
  type BuiltSerializer,
  buildSingleSerializer,
  gifSerializerConfig,
  imageEditAttributes,
  imageSerializerConfig,
  ingredientBulkDeleteSerializerConfig,
  ingredientMergeSerializerConfig,
  ingredientSerializerConfig,
  metadataSerializerConfig,
  musicSerializerConfig,
  videoCaptionSerializerConfig,
  videoEditSerializerConfig,
  videoSerializerConfig,
} from '..';

// Build all ingredient serializers
export const AssetSerializer: BuiltSerializer = buildSingleSerializer(
  'client',
  assetSerializerConfig,
);
export const AvatarSerializer: BuiltSerializer = buildSingleSerializer(
  'client',
  avatarSerializerConfig,
);
export const GifSerializer: BuiltSerializer = buildSingleSerializer(
  'client',
  gifSerializerConfig,
);
export const ImageSerializer: BuiltSerializer = buildSingleSerializer(
  'client',
  imageSerializerConfig,
);
export const ImageEditSerializer: BuiltSerializer = buildSingleSerializer(
  'client',
  {
    attributes: imageEditAttributes,
    type: 'image-edit',
  },
);
export const IngredientBulkDeleteSerializer: BuiltSerializer =
  buildSingleSerializer('client', ingredientBulkDeleteSerializerConfig);
export const IngredientSerializer: BuiltSerializer = buildSingleSerializer(
  'client',
  ingredientSerializerConfig,
);
export const IngredientMergeSerializer: BuiltSerializer = buildSingleSerializer(
  'client',
  ingredientMergeSerializerConfig,
);
export const MetadataSerializer: BuiltSerializer = buildSingleSerializer(
  'client',
  metadataSerializerConfig,
);
export const MusicSerializer: BuiltSerializer = buildSingleSerializer(
  'client',
  musicSerializerConfig,
);
export const VideoSerializer: BuiltSerializer = buildSingleSerializer(
  'client',
  videoSerializerConfig,
);
export const VideoEditSerializer: BuiltSerializer = buildSingleSerializer(
  'client',
  videoEditSerializerConfig,
);
export const VideoCaptionSerializer: BuiltSerializer = buildSingleSerializer(
  'client',
  videoCaptionSerializerConfig,
);
