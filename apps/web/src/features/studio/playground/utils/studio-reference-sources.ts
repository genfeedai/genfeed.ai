import {
  getModelMaxAudioReferences,
  hasAudioReferences,
  hasEndFrame,
  hasVideoReferences,
} from '@genfeedai/contracts/constants';
import type { StudioPlaygroundReferenceRole } from '@genfeedai/contracts/interfaces/studio/studio-playground.interface';
import type { PromptBarReferenceSource } from '@genfeedai/props/prompt-bars/prompt-bar-reference-source.props';
import type { StudioReferenceSourcesInput } from '@/features/studio/props/studio-playground-composer.props';

/**
 * The `+` menu of the composer: one source per reference role the selected
 * type and model accept, disabled once that role is full.
 */
export function buildStudioReferenceSources({
  audioReferenceCount,
  capabilities,
  editSourceCount,
  editSourceLimit,
  inputMediaKind,
  isAutoMode,
  isCrunStartEnd,
  isFlux,
  isUploading,
  labels,
  modelKey,
  onAddFiles,
  onOpenLibrary,
  type,
}: StudioReferenceSourcesInput): PromptBarReferenceSource[] {
  const sources: PromptBarReferenceSource[] = [];
  const addSource = (
    role: StudioPlaygroundReferenceRole,
    label: string,
    accept: string,
    isFull = false,
  ): void => {
    sources.push({
      accept,
      id: role,
      isAttachmentDisabled: isUploading || isFull,
      isLibraryDisabled: isFull,
      label,
      onAddFiles: (files) => onAddFiles(files, role),
      onOpenLibrary: () => onOpenLibrary(role),
    });
  };
  if (capabilities.hasReferences && type === 'image') {
    addSource('reference', labels.reference, 'image/*');
  }
  if (type === 'image-edit') {
    addSource(
      'editSource',
      labels.editSources,
      'image/*',
      editSourceCount >= editSourceLimit,
    );
    if (!isFlux) {
      addSource('editMask', labels.editMask, 'image/*');
    }
  }
  if (type === 'video' && (inputMediaKind !== 'video' || isCrunStartEnd)) {
    addSource('startFrame', labels.startFrame, 'image/*');
    // Auto routes to a model that accepts the end frame when one is attached.
    if (
      isAutoMode ||
      (inputMediaKind === 'video' ? isCrunStartEnd : hasEndFrame(modelKey))
    ) {
      addSource('endFrame', labels.endFrame, 'image/*');
    }
    if (
      !isAutoMode &&
      inputMediaKind !== 'video' &&
      hasVideoReferences(modelKey)
    ) {
      addSource('videoReference', labels.videoReference, 'video/*');
    }
  }

  if (type === 'video' && !isAutoMode && hasAudioReferences(modelKey)) {
    addSource(
      'audioReference',
      labels.audioReference,
      'audio/*',
      audioReferenceCount >= getModelMaxAudioReferences(modelKey),
    );
  }
  return sources;
}
