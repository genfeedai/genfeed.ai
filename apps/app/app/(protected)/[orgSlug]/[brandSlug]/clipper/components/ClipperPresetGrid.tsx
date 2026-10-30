'use client';

import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { ClipperPresetGridProps } from '@genfeedai/props/studio/clipper-presets.props';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { useTranslations } from 'next-intl';
import type { ReactElement } from 'react';
import StudioPresetCard from '@/features/studio/shared/components/StudioPresetCard';
import StudioPresetList from '@/features/studio/shared/components/StudioPresetList';
import ClipperSourceBar from './ClipperSourceBar';

/**
 * Preset cards that open the New project page with the preset's settings
 * already chosen. A clip project needs a source, so a click only navigates:
 * nothing is imported, analyzed or charged until the creator adds a source and
 * starts the project.
 */
export default function ClipperPresetGrid({
  layout = 'grid',
  presets,
}: ClipperPresetGridProps): ReactElement {
  const translate = useTranslations('pages.studioClipper');
  const { href } = useOrgUrl();
  const newProjectHref = href(APP_ROUTES.STUDIO.CLIPPER_NEW);

  return (
    <StudioPresetList
      ariaLabel={translate('presets.listAria')}
      layout={layout}
      testId="clipper-preset-list"
    >
      {presets.map((preset) => {
        const title = translate(`presets.items.${preset.id}.title`);
        return (
          <StudioPresetCard
            actionAriaLabel={translate('presets.useAria', { title })}
            actionLabel={translate('presets.use')}
            chips={[
              translate(`presets.modes.${preset.mode}`),
              translate('presets.maxClips', { count: preset.maxClips }),
              translate('presets.minScore', {
                score: preset.minViralityScore,
              }),
            ]}
            description={translate(`presets.items.${preset.id}.description`)}
            href={`${newProjectHref}?preset=${encodeURIComponent(preset.id)}`}
            icon={preset.icon}
            illustration={<ClipperSourceBar clipCount={preset.maxClips} />}
            key={preset.id}
            layout={layout}
            testId="clipper-preset"
            title={title}
          />
        );
      })}
    </StudioPresetList>
  );
}
