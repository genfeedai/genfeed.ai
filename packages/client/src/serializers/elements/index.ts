import {
  type BuiltSerializer,
  buildSingleSerializer,
  captionSerializerConfig,
  elementBlacklistSerializerConfig,
  elementCameraMovementSerializerConfig,
  elementCameraSerializerConfig,
  elementLensSerializerConfig,
  elementLightingSerializerConfig,
  elementMoodSerializerConfig,
  elementSceneSerializerConfig,
  elementStyleSerializerConfig,
  fontFamilySerializerConfig,
  presetSerializerConfig,
  soundSerializerConfig,
  voiceSerializerConfig,
} from '..';

// Build all element serializers
export const ElementBlacklistSerializer: BuiltSerializer =
  buildSingleSerializer('client', elementBlacklistSerializerConfig);
export const ElementCameraMovementSerializer: BuiltSerializer =
  buildSingleSerializer('client', elementCameraMovementSerializerConfig);
export const ElementCameraSerializer: BuiltSerializer = buildSingleSerializer(
  'client',
  elementCameraSerializerConfig,
);
export const CaptionSerializer: BuiltSerializer = buildSingleSerializer(
  'client',
  captionSerializerConfig,
);
export const FontFamilySerializer: BuiltSerializer = buildSingleSerializer(
  'client',
  fontFamilySerializerConfig,
);
export const ElementLensSerializer: BuiltSerializer = buildSingleSerializer(
  'client',
  elementLensSerializerConfig,
);
export const ElementLightingSerializer: BuiltSerializer = buildSingleSerializer(
  'client',
  elementLightingSerializerConfig,
);
export const ElementMoodSerializer: BuiltSerializer = buildSingleSerializer(
  'client',
  elementMoodSerializerConfig,
);
export const PresetSerializer: BuiltSerializer = buildSingleSerializer(
  'client',
  presetSerializerConfig,
);
export const ElementSceneSerializer: BuiltSerializer = buildSingleSerializer(
  'client',
  elementSceneSerializerConfig,
);
export const SoundSerializer: BuiltSerializer = buildSingleSerializer(
  'client',
  soundSerializerConfig,
);
export const ElementStyleSerializer: BuiltSerializer = buildSingleSerializer(
  'client',
  elementStyleSerializerConfig,
);
export const VoiceSerializer: BuiltSerializer = buildSingleSerializer(
  'client',
  voiceSerializerConfig,
);

// Short aliases for convenience
export {
  ElementBlacklistSerializer as BlacklistSerializer,
  ElementCameraMovementSerializer as CameraMovementSerializer,
  ElementCameraSerializer as CameraSerializer,
  ElementLensSerializer as LensSerializer,
  ElementLightingSerializer as LightingSerializer,
  ElementMoodSerializer as MoodSerializer,
  ElementSceneSerializer as SceneSerializer,
  ElementStyleSerializer as StyleSerializer,
};
