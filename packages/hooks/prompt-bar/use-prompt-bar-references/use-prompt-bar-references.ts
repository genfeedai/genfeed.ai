import { IngredientFormat, ModelCategory } from '@genfeedai/enums';
import type { IAsset, IImage } from '@genfeedai/interfaces';
import type {
  UsePromptBarReferencesOptions,
  UsePromptBarReferencesReturn,
} from '@props/studio/prompt-bar.props';
import { useCallback, useRef, useState } from 'react';

const FORMAT_NAME_MAP: Record<IngredientFormat, string> = {
  [IngredientFormat.LANDSCAPE]: 'landscape',
  [IngredientFormat.SQUARE]: 'square',
  [IngredientFormat.PORTRAIT]: 'portrait',
};

function hasIncompatibleAspectRatio(
  image: IAsset | IImage,
  targetFormat: IngredientFormat,
): boolean {
  const width =
    'metadataWidth' in image && typeof image.metadataWidth === 'number'
      ? image.metadataWidth
      : 0;
  const height =
    'metadataHeight' in image && typeof image.metadataHeight === 'number'
      ? image.metadataHeight
      : 0;

  if (!width || !height) {
    return false;
  }

  const aspectRatio = width / height;

  if (targetFormat === IngredientFormat.LANDSCAPE && aspectRatio < 1) {
    return true;
  }
  if (targetFormat === IngredientFormat.PORTRAIT && aspectRatio > 1) {
    return true;
  }
  if (
    targetFormat === IngredientFormat.SQUARE &&
    Math.abs(aspectRatio - 1) > 0.1
  ) {
    return true;
  }

  return false;
}

export function usePromptBarReferences(
  options: UsePromptBarReferencesOptions,
): UsePromptBarReferencesReturn {
  const {
    form,
    supportsMultipleReferences,
    maxReferenceCount,
    currentModelCategory,
    currentFormat,
    notificationsService,
  } = options;

  const [references, setReferences] = useState<(IAsset | IImage)[]>([]);
  const [referenceSource, setReferenceSource] = useState<
    'brand' | 'ingredient' | ''
  >('');
  const [endFrame, setEndFrame] = useState<IAsset | IImage | null>(null);
  const isUserSelectingReferencesRef = useRef(false);
  const hasInitializedReferencesRef = useRef(false);

  const handleReferenceSelect = useCallback(
    (selection: IAsset | IAsset[] | IImage | IImage[] | null) => {
      const selectedArray = Array.isArray(selection)
        ? selection
        : selection
          ? [selection]
          : [];

      if (
        currentModelCategory === ModelCategory.VIDEO &&
        selectedArray.length > 0
      ) {
        const incompatibleImages = selectedArray.filter((image) =>
          hasIncompatibleAspectRatio(image, currentFormat),
        );

        if (incompatibleImages.length > 0) {
          const formatName =
            FORMAT_NAME_MAP[currentFormat as IngredientFormat] ?? 'portrait';
          const plural = incompatibleImages.length > 1 ? 's have' : ' has';
          notificationsService.warning(
            `Warning: ${incompatibleImages.length} reference image${plural} a different aspect ratio than your ${formatName} video format. This may affect generation quality.`,
            5000,
          );
        }
      }

      if (!supportsMultipleReferences) {
        if (selectedArray.length > 0) {
          const [firstAsset] = selectedArray;
          setReferences([firstAsset]);
          setReferenceSource('ingredient');
          form.setValue('references', [firstAsset.id], {
            shouldValidate: true,
          });
        } else {
          setReferences([]);
          setReferenceSource('');
          form.setValue('references', [], { shouldValidate: true });
        }
        return;
      }

      if (selectedArray.length === 0) {
        setReferences([]);
        setReferenceSource('');
        form.setValue('references', [], { shouldValidate: true });
        return;
      }

      const uniqueSelection = Array.from(
        new Map(selectedArray.map((asset) => [asset.id, asset])).values(),
      );

      if (uniqueSelection.length > maxReferenceCount) {
        notificationsService.error(
          `You can only select up to ${maxReferenceCount} references.`,
        );
      }

      const limitedSelection = uniqueSelection.slice(0, maxReferenceCount);
      setReferences(limitedSelection);
      setReferenceSource('ingredient');
      form.setValue(
        'references',
        limitedSelection.map((asset) => asset.id),
        { shouldValidate: true },
      );
    },
    [
      currentFormat,
      currentModelCategory,
      form,
      maxReferenceCount,
      notificationsService,
      supportsMultipleReferences,
    ],
  );

  const handleSelectAccountReference = useCallback(
    (assets: { id: string; url: string }[]) => {
      if (assets.length === 0) {
        setReferenceSource('');
        setReferences([]);
        form.setValue('references', [], { shouldValidate: true });
        return;
      }

      if (assets.length > maxReferenceCount) {
        notificationsService.error(
          `You can only select up to ${maxReferenceCount} references.`,
        );
      }

      const limitedAssets = supportsMultipleReferences
        ? assets.slice(0, maxReferenceCount)
        : [assets[0]];

      const referenceObjects = limitedAssets.map((asset) => ({
        id: asset.id,
        ingredientUrl: asset.url,
      })) as (IAsset | IImage)[];

      setReferenceSource('brand');
      isUserSelectingReferencesRef.current = true;
      setReferences(referenceObjects);
      form.setValue(
        'references',
        limitedAssets.map((asset) => asset.id),
        { shouldValidate: true },
      );

      setTimeout(() => {
        isUserSelectingReferencesRef.current = false;
      }, 100);
    },
    [form, maxReferenceCount, notificationsService, supportsMultipleReferences],
  );

  return {
    endFrame,
    handleReferenceSelect,
    handleSelectAccountReference,
    hasInitializedReferencesRef,
    isUserSelectingReferencesRef,
    referenceSource,
    references,
    setEndFrame,
    setReferenceSource,
    setReferences,
  };
}
