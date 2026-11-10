import {
  getImageEditMaxSources,
  getModelMaxAudioReferences,
  hasAudioReferences,
  isImageEditModel,
  MODEL_KEYS,
  requiresFirstFrame,
} from '@genfeedai/contracts/constants';
import { AUTO_MODEL_OPTION_VALUE } from '@ui/dropdowns/model-selector/model-selector.constants';
import {
  hasStudioAvatarSelection,
  hasStudioVoiceSelection,
} from '@/features/studio/playground/utils/studio-identity-selection';
import type {
  StudioComposerValidation,
  StudioComposerValidationInput,
} from '@/features/studio/props/studio-playground-composer.props';

const VIDEO_REFERENCE_ROLES: readonly string[] = [
  'reference',
  'startFrame',
  'endFrame',
  'videoReference',
];

/**
 * The reasons Generate waits that come from the form itself: missing or
 * conflicting references, a missing identity, a catalog still loading. Pricing
 * and runtime blockers are decided elsewhere.
 */
export function resolveStudioComposerValidation({
  attachedAssets,
  capabilities,
  inputMediaKind,
  isAutoMode,
  isLoadingModels,
  models,
  selectedModel,
  settings,
  type,
}: StudioComposerValidationInput): StudioComposerValidation {
  const editSourceLimit =
    settings.modelKey === AUTO_MODEL_OPTION_VALUE
      ? Math.max(
          ...models
            .filter((model) => isImageEditModel(model.key))
            .map((model) => getImageEditMaxSources(model.key)),
          getImageEditMaxSources(),
        )
      : getImageEditMaxSources(settings.modelKey);
  const isFirstFrameMissing =
    type === 'video' &&
    !isAutoMode &&
    inputMediaKind !== 'video' &&
    requiresFirstFrame(settings.modelKey) &&
    !attachedAssets.some((asset) => asset.role === 'startFrame');
  const audioReferences = attachedAssets.filter(
    (asset) => asset.role === 'audioReference',
  );
  const isAudioReferenceInvalid =
    audioReferences.length > 0 &&
    (type !== 'video' ||
      !hasAudioReferences(settings.modelKey) ||
      audioReferences.length > getModelMaxAudioReferences(settings.modelKey) ||
      !attachedAssets.some((asset) =>
        VIDEO_REFERENCE_ROLES.includes(asset.role ?? ''),
      ));
  const isReferenceCombinationInvalid =
    type === 'video' &&
    settings.modelKey === MODEL_KEYS.REPLICATE_BYTEDANCE_SEEDANCE_2_5 &&
    attachedAssets.some((asset) => asset.role === 'videoReference') &&
    attachedAssets.some(
      (asset) => asset.role === 'startFrame' || asset.role === 'endFrame',
    );
  const isKling4KReferenceInvalid =
    type === 'video' &&
    settings.modelKey === MODEL_KEYS.REPLICATE_KWAIVGI_KLING_V3_OMNI_VIDEO &&
    settings.resolution === '4k' &&
    attachedAssets.some((asset) => asset.role === 'videoReference');
  // An avatar video needs both an avatar and a voice; a voice clip needs a voice.
  const isIdentityMissing =
    capabilities.hasIdentity &&
    ((type === 'avatar' && !hasStudioAvatarSelection(settings)) ||
      !hasStudioVoiceSelection(settings));
  // Submitting mid-catalog-load would resolve the model against an empty or
  // stale list, so the send button waits for the type's models to land.
  const isAwaitingModels = capabilities.hasModelSelection && isLoadingModels;
  const editSources = attachedAssets.filter(
    (asset) => asset.role === 'editSource',
  );
  const hasEditMask = attachedAssets.some((asset) => asset.role === 'editMask');
  const isEditSourceMissing =
    type === 'image-edit' &&
    (editSources.length < 1 || editSources.length > editSourceLimit);
  const isEditingModelUnavailable =
    type === 'image-edit' &&
    !isLoadingModels &&
    (isAutoMode
      ? !models.some((model) => isImageEditModel(model.key))
      : !selectedModel);
  return {
    audioReferences,
    editSourceLimit,
    editSources,
    hasEditMask,
    isAudioReferenceInvalid,
    isAwaitingModels,
    isEditingModelUnavailable,
    isEditSourceMissing,
    isFirstFrameMissing,
    isIdentityMissing,
    isKling4KReferenceInvalid,
    isReferenceCombinationInvalid,
  };
}
