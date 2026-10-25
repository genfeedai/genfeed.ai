'use client';

import type { MotionPresetGridProps } from '@genfeedai/props/studio/motion-presets.props';
import StudioPresetCard from '@pages/studio/shared/components/StudioPresetCard';
import StudioPresetList from '@pages/studio/shared/components/StudioPresetList';
import { useTranslations } from 'next-intl';
import type { ReactElement } from 'react';
import MotionFramePreview from './MotionFramePreview';

const FPS = 30;

/**
 * Preset cards that fill the compose form in place. Applying a preset only
 * sets the form fields: nothing is quoted, submitted or charged until the
 * creator reviews the prompt, requests a quote and acknowledges its maximum.
 */
export default function MotionPresetGrid({
  appliedPresetId,
  layout = 'grid',
  onApply,
  presets,
}: MotionPresetGridProps): ReactElement {
  const translate = useTranslations('pages.studioMotion');

  return (
    <StudioPresetList
      ariaLabel={translate('presets.listAria')}
      layout={layout}
      testId="motion-preset-list"
    >
      {presets.map((preset) => {
        const title = translate(`presets.items.${preset.id}.title`);
        return (
          <StudioPresetCard
            actionAriaLabel={translate('presets.useAria', { title })}
            actionLabel={translate(
              appliedPresetId === preset.id ? 'presets.applied' : 'presets.use',
            )}
            chips={[
              `${preset.width}×${preset.height}`,
              translate('presets.seconds', {
                seconds: Math.round(preset.durationFrames / FPS),
              }),
              'MP4',
            ]}
            description={translate(`presets.items.${preset.id}.description`)}
            icon={preset.icon}
            illustration={
              <MotionFramePreview
                durationFrames={preset.durationFrames}
                height={preset.height}
                width={preset.width}
              />
            }
            key={preset.id}
            layout={layout}
            onSelect={() => onApply(preset)}
            testId="motion-preset"
            title={title}
          />
        );
      })}
    </StudioPresetList>
  );
}
