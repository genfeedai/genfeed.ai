'use client';

import StudioPresetShelf from '@pages/studio/shared/components/StudioPresetShelf';
import { useTranslations } from 'next-intl';
import type { ReactElement } from 'react';
import TurboPresetGrid from './TurboPresetGrid';
import { TURBO_PRESETS } from './turbo-presets';

/** Presets for returning users: one scrolling row that expands to the grid. */
export default function TurboPresetShelf(): ReactElement {
  const translate = useTranslations('pages.turboProjects.presets');

  return (
    <StudioPresetShelf
      presets={TURBO_PRESETS}
      renderPresets={(presets, layout) => (
        <TurboPresetGrid layout={layout} presets={presets} />
      )}
      seeAllLabel={translate('seeAll')}
      showFewerLabel={translate('showFewer')}
      title={translate('shelfTitle')}
    />
  );
}
