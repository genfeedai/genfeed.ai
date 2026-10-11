'use client';

import StudioPresetShelf from '@pages/studio/shared/components/StudioPresetShelf';
import { useTranslations } from 'next-intl';
import type { ReactElement } from 'react';
import { CLIPS_PRESETS } from '../data/clips-presets';
import ClipsPresetGrid from './ClipsPresetGrid';

/** Presets for returning users: one scrolling row that expands to the grid. */
export default function ClipsPresetShelf(): ReactElement {
  const translate = useTranslations('pages.studioClips.presets');

  return (
    <StudioPresetShelf
      presets={CLIPS_PRESETS}
      renderPresets={(presets, layout) => (
        <ClipsPresetGrid layout={layout} presets={presets} />
      )}
      seeAllLabel={translate('seeAll')}
      showFewerLabel={translate('showFewer')}
      title={translate('shelfTitle')}
    />
  );
}
