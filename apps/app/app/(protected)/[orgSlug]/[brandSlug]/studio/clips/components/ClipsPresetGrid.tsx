'use client';

import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { ClipsPresetGridProps } from '@genfeedai/props/studio/clips-presets.props';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import StudioPresetCard from '@pages/studio/shared/components/StudioPresetCard';
import StudioPresetList from '@pages/studio/shared/components/StudioPresetList';
import { useTranslations } from 'next-intl';
import type { ReactElement } from 'react';
import ClipsSourceBar from './ClipsSourceBar';

/**
 * Preset cards that open the New project page with the preset's settings
 * already chosen. A clip project needs a source, so a click only navigates:
 * nothing is imported, analyzed or charged until the creator adds a source and
 * starts the project.
 */
export default function ClipsPresetGrid({
  layout = 'grid',
  presets,
}: ClipsPresetGridProps): ReactElement {
  const translate = useTranslations('pages.studioClips');
  const { href } = useOrgUrl();
  const newProjectHref = href(APP_ROUTES.STUDIO.CLIPS_NEW);

  return (
    <StudioPresetList
      ariaLabel={translate('presets.listAria')}
      layout={layout}
      testId="clips-preset-list"
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
            illustration={<ClipsSourceBar clipCount={preset.maxClips} />}
            key={preset.id}
            layout={layout}
            testId="clips-preset"
            title={title}
          />
        );
      })}
    </StudioPresetList>
  );
}
