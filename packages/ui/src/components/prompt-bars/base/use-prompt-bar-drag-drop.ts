import type { PromptTextareaSchema } from '@genfeedai/client/schemas';
import { IngredientCategory } from '@genfeedai/enums';
import type { IAsset, IImage, IIngredient } from '@genfeedai/interfaces';
import type { MediaConfig } from '@genfeedai/interfaces/ui/media-config.interface';
import type { UploadModalOptions } from '@genfeedai/props/studio/prompt-bar.props';
import type { DragEvent } from 'react';
import { useCallback, useRef, useState } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { isFileDrag, normalizeUploadedReference } from './prompt-bar.helpers';

type UsePromptBarDragDropParams = {
  currentConfig: MediaConfig;
  endFrame: IAsset | IImage | null;
  form: UseFormReturn<PromptTextareaSchema>;
  handleReferenceSelect: (
    selection: IAsset | IImage | IAsset[] | IImage[] | null,
  ) => void;
  isDisabledState: boolean;
  isOnlyImagenModels: boolean;
  maxReferenceCount: number;
  openUpload: (options: UploadModalOptions) => void;
  referenceSource: 'brand' | 'ingredient' | '';
  references: (IAsset | IImage)[];
  setEndFrame: (value: IAsset | IImage | null) => void;
  setReferenceSource: (value: '' | 'brand' | 'ingredient') => void;
  setReferences: (value: (IAsset | IImage)[]) => void;
  supportsMultipleReferences: boolean;
  triggerConfigChange: () => void;
  watchedHeight?: number;
  watchedWidth?: number;
};

type UsePromptBarDragDropResult = {
  isDragActive: boolean;
  dragError: string | null;
  handleRemoveAttachedAsset: (assetId: string) => void;
  handlePromptBarDragEnter: (event: DragEvent<HTMLDivElement>) => void;
  handlePromptBarDragLeave: (event: DragEvent<HTMLDivElement>) => void;
  handleDroppedFiles: (event: DragEvent<HTMLDivElement>) => Promise<void>;
};

export function usePromptBarDragDrop({
  currentConfig,
  endFrame,
  form,
  handleReferenceSelect,
  isDisabledState,
  isOnlyImagenModels,
  maxReferenceCount,
  openUpload,
  referenceSource,
  references,
  setEndFrame,
  setReferenceSource,
  setReferences,
  supportsMultipleReferences,
  triggerConfigChange,
  watchedHeight,
  watchedWidth,
}: UsePromptBarDragDropParams): UsePromptBarDragDropResult {
  const [isDragActive, setIsDragActive] = useState(false);
  const [dragError, setDragError] = useState<string | null>(null);
  const dragDepthRef = useRef(0);

  const handleRemoveAttachedAsset = useCallback(
    (assetId: string) => {
      if (endFrame?.id === assetId) {
        setEndFrame(null);
        form.setValue('endFrame', '', { shouldValidate: true });
        triggerConfigChange();
        return;
      }

      const updatedReferences = references.filter(
        (reference) => reference.id !== assetId,
      );
      setReferences(updatedReferences);
      setReferenceSource(updatedReferences.length > 0 ? referenceSource : '');
      form.setValue(
        'references',
        updatedReferences.reduce<string[]>((acc, reference) => {
          if (reference.id) acc.push(reference.id);
          return acc;
        }, []),
        { shouldValidate: true },
      );
      triggerConfigChange();
    },
    [
      endFrame,
      form,
      referenceSource,
      references,
      setEndFrame,
      setReferenceSource,
      setReferences,
      triggerConfigChange,
    ],
  );

  const handlePromptBarDragEnter = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (
        isDisabledState ||
        !currentConfig.buttons?.reference ||
        isOnlyImagenModels ||
        !isFileDrag(event)
      ) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      dragDepthRef.current += 1;
      setDragError(null);
      setIsDragActive(true);
    },
    [currentConfig.buttons, isDisabledState, isOnlyImagenModels],
  );

  const handlePromptBarDragLeave = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (!isFileDrag(event)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
      if (dragDepthRef.current === 0) {
        setIsDragActive(false);
      }
    },
    [],
  );

  const handleDroppedUploadComplete = useCallback(
    (uploadedIngredients: (IIngredient | IAsset)[]) => {
      const uploadedReferences = uploadedIngredients.reduce<
        (IAsset | IImage)[]
      >((acc, uploaded) => {
        const reference = normalizeUploadedReference(uploaded);
        if (reference !== null) acc.push(reference);
        return acc;
      }, []);

      if (uploadedReferences.length === 0) {
        return;
      }

      if (!supportsMultipleReferences) {
        handleReferenceSelect(
          uploadedReferences[uploadedReferences.length - 1],
        );
        triggerConfigChange();
        return;
      }

      const mergedReferences = [
        ...references.filter(
          (existingReference) =>
            !uploadedReferences.some(
              (uploaded) => uploaded.id === existingReference.id,
            ),
        ),
        ...uploadedReferences,
      ].slice(0, maxReferenceCount);

      handleReferenceSelect(mergedReferences as IAsset[] | IImage[]);
      triggerConfigChange();
    },
    [
      handleReferenceSelect,
      maxReferenceCount,
      references,
      supportsMultipleReferences,
      triggerConfigChange,
    ],
  );

  const handleDroppedFiles = useCallback(
    async (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      dragDepthRef.current = 0;
      setIsDragActive(false);

      if (
        isDisabledState ||
        !currentConfig.buttons?.reference ||
        isOnlyImagenModels
      ) {
        return;
      }

      const droppedFiles = Array.from(event.dataTransfer?.files ?? []);
      if (droppedFiles.length === 0) {
        return;
      }

      const validImageFiles = droppedFiles.filter((file) =>
        file.type.startsWith('image/'),
      );

      if (validImageFiles.length === 0) {
        setDragError(
          'Only image files can be attached as references in the studio prompt bar.',
        );
        return;
      }

      const filesToUpload = supportsMultipleReferences
        ? validImageFiles.slice(0, maxReferenceCount)
        : validImageFiles.slice(-1);

      setDragError(null);
      openUpload({
        autoSubmit: true,
        category: IngredientCategory.IMAGE,
        height: watchedHeight,
        initialFiles: filesToUpload,
        isMultiple: supportsMultipleReferences,
        maxFiles: supportsMultipleReferences ? maxReferenceCount : 1,
        onComplete: handleDroppedUploadComplete,
        width: watchedWidth,
      });
    },
    [
      currentConfig.buttons,
      handleDroppedUploadComplete,
      isDisabledState,
      isOnlyImagenModels,
      maxReferenceCount,
      openUpload,
      supportsMultipleReferences,
      watchedHeight,
      watchedWidth,
    ],
  );

  return {
    isDragActive,
    dragError,
    handleRemoveAttachedAsset,
    handlePromptBarDragEnter,
    handlePromptBarDragLeave,
    handleDroppedFiles,
  };
}
