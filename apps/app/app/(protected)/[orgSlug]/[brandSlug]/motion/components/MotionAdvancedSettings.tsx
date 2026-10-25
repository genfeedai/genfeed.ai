'use client';

import type {
  MotionAdvancedSettingsProps,
  MotionSettingKey,
} from '@genfeedai/props/studio/motion-composer.props';
import { Checkbox } from '@ui/primitives/checkbox';
import { Input } from '@ui/primitives/input';
import { Textarea } from '@ui/primitives/textarea';
import { useTranslations } from 'next-intl';
import type { ReactElement } from 'react';

const SETTING_KEYS: readonly MotionSettingKey[] = [
  'width',
  'height',
  'fps',
  'durationFrames',
];

const OUTPUT_FORMATS = ['mp4', 'png', 'jpeg'] as const;

/**
 * Everything the Motion prompt bar does not need on its face: canvas size,
 * props JSON, Library source assets and output formats. It opens from the
 * toolbar so the bar stays one composer.
 */
export default function MotionAdvancedSettings({
  assetIds,
  formats,
  frames,
  inheritedOutputs,
  isProject,
  libraryAssets,
  onAssetToggle,
  onFormatToggle,
  onFramesChange,
  onPropsTextChange,
  onSettingChange,
  propsText,
  settings,
}: MotionAdvancedSettingsProps): ReactElement {
  const t = useTranslations('pages.studioMotion');

  return (
    <div className="grid gap-4">
      {!isProject ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            {SETTING_KEYS.map((key) => (
              <label key={key} className="grid gap-1.5 text-xs">
                {t(key)}
                <Input
                  type="number"
                  value={settings[key]}
                  onChange={(event) =>
                    onSettingChange(key, Number(event.target.value))
                  }
                />
              </label>
            ))}
          </div>
          <label className="grid gap-1.5 text-xs">
            {t('props')}
            <Textarea
              rows={3}
              value={propsText}
              onChange={(event) => onPropsTextChange(event.target.value)}
              className="font-mono text-xs"
            />
          </label>
          <fieldset className="grid gap-1.5">
            <legend className="text-xs">{t('libraryAssets')}</legend>
            <p className="text-xs text-muted-foreground">{t('libraryHint')}</p>
            <div className="max-h-32 space-y-2 overflow-y-auto">
              {libraryAssets.map((asset) => (
                <Checkbox
                  key={asset.id}
                  checked={assetIds.includes(asset.id)}
                  disabled={
                    !assetIds.includes(asset.id) && assetIds.length >= 12
                  }
                  label={asset.label}
                  onCheckedChange={(isChecked) =>
                    onAssetToggle(asset.id, isChecked === true)
                  }
                />
              ))}
            </div>
          </fieldset>
        </>
      ) : null}
      <fieldset className="grid gap-2">
        <legend className="text-xs">
          {isProject ? t('exportOutputs') : t('outputs')}
        </legend>
        {isProject ? (
          <p className="text-xs text-muted-foreground">
            {t('inheritedOutputs')} {inheritedOutputs}
          </p>
        ) : null}
        <div className="flex gap-4">
          {OUTPUT_FORMATS.map((format) => (
            <label key={format} className="flex items-center gap-2 text-xs">
              <Checkbox
                aria-label={format.toUpperCase()}
                checked={formats.includes(format)}
                onCheckedChange={(isChecked) =>
                  onFormatToggle(format, isChecked === true)
                }
              />
              {format.toUpperCase()}
            </label>
          ))}
        </div>
        {formats.some((format) => format !== 'mp4') ? (
          <label className="grid gap-1.5 text-xs">
            {t('frames')}
            <Input
              value={frames}
              onChange={(event) => onFramesChange(event.target.value)}
            />
          </label>
        ) : null}
      </fieldset>
      <p className="text-xs text-muted-foreground">{t('limits')}</p>
    </div>
  );
}
