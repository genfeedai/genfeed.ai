'use client';

import {
  FLUX_3_ASPECT_RATIOS,
  FLUX_3_RESOLUTIONS,
  IMAGE_EDIT_SIZES,
  isImageEditSize,
} from '@genfeedai/contracts/constants';
import { Input } from '@ui/primitives/input';
import PromptBarCompactSelect from '@ui/prompt-bars/components/toolbar/PromptBarCompactSelect';
import { useTranslations } from 'next-intl';
import type { ReactElement } from 'react';
import type { StudioComposerImageControlsProps } from '@/features/studio/props/studio-playground-composer.props';

/** The FLUX output pickers and the image-edit target, size and seed row. */
export default function StudioComposerImageControls({
  droppedEditingControls,
  editSourceLimit,
  editSources,
  hasEditMask,
  isEditingModelUnavailable,
  isEditSourceMissing,
  isFlux,
  onSettingsChange,
  settings,
  type,
}: StudioComposerImageControlsProps): ReactElement {
  const translate = useTranslations('pages.studioPlayground');
  return (
    <>
      {isFlux ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <PromptBarCompactSelect
            ariaLabel={translate('editImage.fluxResolution')}
            icon="output"
            onChange={(resolution) => onSettingsChange({ resolution })}
            options={FLUX_3_RESOLUTIONS.map((value) => ({
              label: value.toUpperCase(),
              value,
            }))}
            value={settings.resolution}
          />
          <PromptBarCompactSelect
            ariaLabel={translate('editImage.fluxAspectRatio')}
            icon="aspectRatio"
            onChange={(aspectRatio) => onSettingsChange({ aspectRatio })}
            options={FLUX_3_ASPECT_RATIOS.map((value) => ({
              label:
                value === 'auto'
                  ? type === 'image-edit'
                    ? translate('editImage.matchSourceAspectRatio')
                    : translate('editImage.autoAspectRatio')
                  : value,
              value,
            }))}
            value={settings.aspectRatio}
          />
          {droppedEditingControls ? (
            <p role="status" className="text-xs text-muted-foreground">
              {translate('editImage.removedFluxControls')}
            </p>
          ) : null}
        </div>
      ) : null}
      {type === 'image-edit' ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {editSources.length > 1 ? (
            <PromptBarCompactSelect
              ariaLabel={translate('editImage.targetAria')}
              icon="source"
              onChange={(editPrimaryId) => onSettingsChange({ editPrimaryId })}
              options={editSources.map((asset, index) => ({
                label: translate('editImage.target', {
                  name:
                    asset.name ||
                    translate('editImage.sourceFallback', {
                      index: index + 1,
                    }),
                }),
                value: asset.ingredientId ?? asset.id,
              }))}
              placeholder={translate('editImage.targetPlaceholder')}
              value={
                settings.editPrimaryId ??
                editSources[0].ingredientId ??
                editSources[0].id
              }
            />
          ) : null}
          {!isFlux ? (
            <>
              <PromptBarCompactSelect
                ariaLabel={translate('editImage.outputSize')}
                icon="output"
                isDisabled={hasEditMask}
                onChange={(value) => {
                  if (isImageEditSize(value))
                    onSettingsChange({ editSize: value });
                }}
                options={IMAGE_EDIT_SIZES.map((size) => ({
                  label:
                    size === 'source'
                      ? translate('editImage.sourceDimensions')
                      : size,
                  value: size,
                }))}
                value={hasEditMask ? 'source' : (settings.editSize ?? 'source')}
              />
              <Input
                aria-label={translate('editImage.seedAria')}
                className="w-36"
                type="number"
                min={0}
                max={2147483647}
                step={1}
                placeholder={translate('editImage.seedPlaceholder')}
                value={settings.editSeed ?? ''}
                onChange={(event) =>
                  onSettingsChange({
                    editSeed:
                      event.target.value === ''
                        ? undefined
                        : Number(event.target.value),
                  })
                }
              />
            </>
          ) : null}
          <p className="text-xs text-muted-foreground">
            {translate('editImage.firstSource', {
              count: editSources.length,
              limit: editSourceLimit,
            })}
            {isFlux
              ? translate('editImage.fluxSemantics')
              : translate('editImage.maskSemantics')}
          </p>
          {isEditSourceMissing || isEditingModelUnavailable ? (
            <p role="status" className="text-xs text-destructive">
              {isEditSourceMissing
                ? editSources.length > editSourceLimit
                  ? translate('editImage.overLimit', { limit: editSourceLimit })
                  : translate('editImage.chooseSource')
                : translate('editImage.modelUnavailable')}
            </p>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
