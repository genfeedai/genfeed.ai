'use client';

import { ButtonVariant, IngredientCategory } from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { IAsset, IImage } from '@genfeedai/interfaces';
import type { PromptBarFrameControlsProps } from '@genfeedai/props/studio/prompt-bar.props';
import { EnvironmentService } from '@genfeedai/services/core/environment.service';
import { Button } from '@ui/primitives/button';
import Image from 'next/image';
import { type MouseEvent, memo } from 'react';
import { HiArrowUpTray, HiPhoto, HiTv, HiXMark } from 'react-icons/hi2';

function getImageUrl(
  asset: IAsset | IImage,
  referenceSource: 'brand' | 'ingredient' | '',
): string {
  if ('ingredientUrl' in asset && asset.ingredientUrl) {
    return asset.ingredientUrl;
  }

  const endpoint = EnvironmentService.ingredientsEndpoint;
  const path = referenceSource === 'brand' ? 'references' : 'images';
  return `${endpoint}/${path}/${asset.id}`;
}

function getStartFrameLabel(
  isVideoModel: boolean,
  requiresReferences: boolean,
  supportsMultipleReferences: boolean,
  refCount: number,
  maxCount: number,
): string {
  if (isVideoModel) {
    if (requiresReferences) {
      return 'Start Frame (Required)';
    }
    if (supportsMultipleReferences) {
      return `Start Frame (${refCount}/${maxCount})`;
    }
    return 'Start Frame';
  }

  const countLabel = supportsMultipleReferences
    ? `(${refCount}/${maxCount}) `
    : '';
  if (requiresReferences) {
    return `Reference ${countLabel}(Required)`;
  }
  if (supportsMultipleReferences) {
    return `References (${refCount}/${maxCount})`;
  }
  return 'Reference';
}

function getStartFrameTooltip(
  hasInterpolation: boolean,
  hasEndFrame: boolean,
  endFrame: unknown,
  hasAnyImagenModel: boolean,
  refCount: number,
  defaultLabel: string,
): string {
  if (!hasInterpolation && hasEndFrame && endFrame) {
    return 'Disabled when end frame selected (model does not support interpolation)';
  }
  if (hasAnyImagenModel) {
    return 'Reference images will not be used for Imagen models';
  }
  if (refCount > 0) {
    return 'Click to change, X to clear';
  }
  return defaultLabel;
}

function getEndFrameTooltip(
  hasInterpolation: boolean,
  refCount: number,
  endFrame: unknown,
): string {
  if (hasInterpolation && refCount === 0) {
    return 'Select a start frame first for interpolation';
  }
  if (!hasInterpolation && refCount > 0) {
    return 'Disabled when start frame selected (model does not support interpolation)';
  }
  if (endFrame) {
    return 'Click to change, X to clear';
  }
  return 'End Frame';
}

const PromptBarFrameControls = memo(function PromptBarFrameControls({
  hasEndFrame,
  hasInterpolation,
  supportsMultipleReferences,
  requiresReferences,
  maxReferenceCount,
  isVideoModel,
  hasAnyImagenModel,
  references,
  endFrame,
  referenceSource,
  onReferencesChange,
  onReferenceSourceChange,
  onEndFrameChange,
  openGallery,
  openUpload,
  form,
  watchedFormat,
  watchedWidth,
  watchedHeight,
  disabled,
  iconButtonClass,
  showReference = true,
  triggerConfigChange,
}: PromptBarFrameControlsProps) {
  if (!showReference) {
    return null;
  }

  const startFrameLabel = getStartFrameLabel(
    isVideoModel,
    requiresReferences,
    supportsMultipleReferences,
    references.length,
    maxReferenceCount,
  );

  const isStartFrameDisabled =
    disabled || (!hasInterpolation && hasEndFrame && endFrame !== null);

  const isEndFrameDisabled =
    disabled ||
    (!hasInterpolation && references.length > 0) ||
    (hasInterpolation && references.length === 0);

  const startFrameTooltip = getStartFrameTooltip(
    hasInterpolation,
    hasEndFrame,
    endFrame,
    hasAnyImagenModel,
    references.length,
    startFrameLabel,
  );

  const endFrameTooltip = getEndFrameTooltip(
    hasInterpolation,
    references.length,
    endFrame,
  );

  const setReferences = (
    assets: (IAsset | IImage)[],
    source: 'brand' | 'ingredient',
  ) => {
    onReferencesChange(assets);
    onReferenceSourceChange(source);
    form.setValue(
      'references',
      assets.map((a) => a.id),
      { shouldValidate: true },
    );
  };

  const handleReferenceSelect = (
    asset: IAsset | IImage | (IAsset | IImage)[],
  ) => {
    if (Array.isArray(asset)) {
      setReferences(asset, 'brand');
    } else {
      setReferences([asset], 'ingredient');
    }
  };

  const clearReferences = (e: MouseEvent) => {
    e.stopPropagation();
    onReferencesChange([]);
    onReferenceSourceChange('');
    form.setValue('references', [], { shouldValidate: true });
  };

  const clearEndFrame = (e: MouseEvent) => {
    e.stopPropagation();
    onEndFrameChange(null);
    form.setValue('endFrame', '', { shouldValidate: true });
    triggerConfigChange();
  };

  const getMaxSelectableItems = (): number => {
    if (isVideoModel) {
      return 1;
    }
    return supportsMultipleReferences ? maxReferenceCount : 1;
  };

  const openStartFrameGallery = () => {
    openGallery({
      category: IngredientCategory.IMAGE,
      format: watchedFormat,
      maxSelectableItems: getMaxSelectableItems(),
      onSelect: handleReferenceSelect,
      onSelectAccountReference: (assets) => setReferences(assets, 'brand'),
      selectedReferences: references
        .map((ref) => ref.id)
        .filter((id): id is string => id !== undefined),
      title: isVideoModel ? 'Select Start Frame' : 'Select Reference Images',
    });
  };

  const openEndFrameGallery = () => {
    openGallery({
      category: IngredientCategory.IMAGE,
      format: watchedFormat,
      maxSelectableItems: 1,
      onSelect: (asset) => {
        const selectedAsset = Array.isArray(asset) ? asset[0] : asset;
        if (selectedAsset?.id) {
          onEndFrameChange(selectedAsset);
          form.setValue('endFrame', selectedAsset.id, { shouldValidate: true });
          triggerConfigChange();
        }
      },
      selectedReferences: endFrame?.id ? [endFrame.id] : [],
      title: 'Select End Frame',
    });
  };

  const handleUploadConfirm = (ingredient?: IImage | IAsset) => {
    if (!ingredient) {
      return;
    }

    if (supportsMultipleReferences) {
      const existingRefs = references.filter((ref) => ref.id !== ingredient.id);
      const newRefs = [...existingRefs, ingredient].slice(0, maxReferenceCount);
      setReferences(newRefs, 'ingredient');
    } else {
      setReferences([ingredient], 'ingredient');
    }
  };

  const renderClearButton = (
    onClick: (e: MouseEvent) => void,
    title: string,
  ) => (
    <Button
      variant={ButtonVariant.UNSTYLED}
      withWrapper={false}
      onClick={onClick}
      ariaLabel={title}
      className="absolute top-0 right-0 w-4 h-4 bg-black/70 hover:bg-error rounded-bl flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
      tooltip={title}
      icon={<HiXMark className="w-3 h-3 text-white" />}
    />
  );

  return (
    <>
      <Button
        tooltipPosition="top"
        className={cn(
          iconButtonClass,
          requiresReferences &&
            references.length === 0 &&
            '!bg-warning/20 !border-warning !text-warning animate-pulse',
          references.length > 0 && 'p-0 overflow-hidden',
        )}
        onClick={openStartFrameGallery}
        isDisabled={isStartFrameDisabled}
        tooltip={startFrameTooltip}
        data-testid="reference-button"
        icon={
          references.length > 0 ? (
            <div className="relative w-10 h-10 group">
              <Image
                src={getImageUrl(references[0], referenceSource)}
                alt={isVideoModel ? 'Start Frame' : 'Reference'}
                className="w-full h-full object-cover"
                width={40}
                height={40}
                sizes="40px"
                priority
              />
              {references.length > 1 && (
                <div className="absolute bottom-0 right-0 bg-primary text-primary-foreground text-[10px] font-bold w-4 h-4 rounded-tl flex items-center justify-center">
                  {references.length}
                </div>
              )}
              {renderClearButton(
                clearReferences,
                isVideoModel ? 'Clear start frame' : 'Clear reference',
              )}
            </div>
          ) : (
            <HiPhoto className="w-4 h-4" />
          )
        }
      />

      {hasEndFrame && references.length <= 1 && (
        <Button
          onClick={openEndFrameGallery}
          isDisabled={isEndFrameDisabled}
          tooltipPosition="top"
          className={cn(iconButtonClass, endFrame && 'p-0 overflow-hidden')}
          tooltip={endFrameTooltip}
          data-testid="end-frame-button"
          icon={
            endFrame ? (
              <div className="relative w-10 h-10 group">
                <Image
                  src={getImageUrl(endFrame, 'ingredient')}
                  alt="End Frame"
                  className="w-full h-full object-cover"
                  width={40}
                  height={40}
                  sizes="40px"
                  priority
                />
                {renderClearButton(clearEndFrame, 'Clear end frame')}
              </div>
            ) : (
              <HiTv className="w-4 h-4" />
            )
          }
        />
      )}

      <Button
        isDisabled={disabled}
        tooltip={
          isVideoModel
            ? 'Upload start frame (drag and drop also supported)'
            : 'Upload reference (drag and drop also supported)'
        }
        tooltipPosition="top"
        className={cn(iconButtonClass, 'opacity-80')}
        icon={<HiArrowUpTray className="w-4 h-4" />}
        onClick={() => {
          openUpload({
            category: IngredientCategory.IMAGE,
            height: watchedHeight,
            isMultiple: false,
            onConfirm: handleUploadConfirm,
            width: watchedWidth,
          });
        }}
      />
    </>
  );
});

export default PromptBarFrameControls;
