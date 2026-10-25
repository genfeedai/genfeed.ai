'use client';

import StudioPresetShelf from '@pages/studio/shared/components/StudioPresetShelf';
import { useTranslations } from 'next-intl';
import type { ReactElement } from 'react';
import { CLIPPER_PRESETS } from '../data/clipper-presets';
import ClipperPresetGrid from './ClipperPresetGrid';

/** Presets for returning users: one scrolling row that expands to the grid. */
export default function ClipperPresetShelf(): ReactElement {
  const translate = useTranslations('pages.studioClipper.presets');

  return (
    <StudioPresetShelf
      presets={CLIPPER_PRESETS}
      renderPresets={(presets, layout) => (
        <ClipperPresetGrid layout={layout} presets={presets} />
      )}
      seeAllLabel={translate('seeAll')}
      showFewerLabel={translate('showFewer')}
      title={translate('shelfTitle')}
    />
  );
}
