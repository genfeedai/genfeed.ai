'use client';

import { REPOST_VARIANT_PRESET } from '@genfeedai/contracts/constants';
import type { IVideoRepostVariantParams } from '@genfeedai/contracts/interfaces/components/video-operations.interface';
import { Checkbox } from '@ui/primitives/checkbox';
import { useTranslations } from 'next-intl';

export interface RepostVariantSelection {
  isMirrored: boolean;
  isSpedUp: boolean;
  isTrimmedAtStart: boolean;
  isZoomed: boolean;
}

export function getDefaultRepostVariantSelection(): RepostVariantSelection {
  return {
    isMirrored: true,
    isSpedUp: true,
    isTrimmedAtStart: false,
    isZoomed: false,
  };
}

export function hasRepostVariantChange(
  selection: RepostVariantSelection,
): boolean {
  return Object.values(selection).some(Boolean);
}

/** The request body for the picked changes; unpicked ones are left out. */
export function toRepostVariantParams(
  selection: RepostVariantSelection,
): IVideoRepostVariantParams {
  return {
    ...(selection.isMirrored ? { isMirrored: true } : {}),
    ...(selection.isSpedUp ? { speed: REPOST_VARIANT_PRESET.speed } : {}),
    ...(selection.isZoomed ? { zoom: REPOST_VARIANT_PRESET.zoom } : {}),
    ...(selection.isTrimmedAtStart
      ? { trimStartSeconds: REPOST_VARIANT_PRESET.trimStartSeconds }
      : {}),
  };
}

interface RepostVariantControlsProps {
  onChange: (selection: RepostVariantSelection) => void;
  selection: RepostVariantSelection;
}

export default function RepostVariantControls({
  onChange,
  selection,
}: RepostVariantControlsProps) {
  const translate = useTranslations(
    'common.videoCreativeActions.repostVariant',
  );

  const options = [
    {
      hint: translate('mirrorHint'),
      key: 'isMirrored',
      label: translate('mirror'),
    },
    {
      hint: translate('speedHint'),
      key: 'isSpedUp',
      label: translate('speed', { speed: REPOST_VARIANT_PRESET.speed }),
    },
    {
      hint: translate('zoomHint'),
      key: 'isZoomed',
      label: translate('zoom'),
    },
    {
      hint: translate('trimStartHint'),
      key: 'isTrimmedAtStart',
      label: translate('trimStart', {
        seconds: REPOST_VARIANT_PRESET.trimStartSeconds,
      }),
    },
  ] as const;

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        {translate('description')}
      </p>
      {options.map((option) => (
        <Checkbox
          key={option.key}
          isChecked={selection[option.key]}
          label={
            <span className="flex flex-col">
              <span className="text-sm font-medium">{option.label}</span>
              <span className="text-xs text-muted-foreground">
                {option.hint}
              </span>
            </span>
          }
          onCheckedChange={(checked) =>
            onChange({ ...selection, [option.key]: checked === true })
          }
        />
      ))}
    </div>
  );
}
