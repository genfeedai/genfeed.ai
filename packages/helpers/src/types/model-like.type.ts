import type {
  ModelCategory,
  ModelProvider,
  QualityTier,
} from '@genfeedai/enums';

export interface ModelLike {
  aspectRatios?: readonly string[];
  category: ModelCategory;
  cost?: number;
  createdAt?: string;
  defaultAspectRatio?: string;
  defaultDuration?: number;
  durations?: number[];
  hasAudioToggle?: boolean;
  hasDurationEditing?: boolean;
  hasEndFrame?: boolean;
  hasInterpolation?: boolean;
  hasResolutionOptions?: boolean;
  hasSpeech?: boolean;
  id?: string;
  isActive?: boolean;
  isBatchSupported?: boolean;
  isDefault?: boolean;
  isDeleted?: boolean;
  isImagenModel?: boolean;
  isReferencesMandatory?: boolean;
  key: string;
  label?: string;
  maxOutputs?: number;
  maxReferences?: number;
  provider?: ModelProvider;
  qualityTier?: QualityTier;
  updatedAt?: string;
  usesOrientation?: boolean;
}
