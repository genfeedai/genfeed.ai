'use client';

import { useTranslations } from 'next-intl';
import type { ReactElement } from 'react';
import StudioPresetShelf from '@/features/studio/shared/components/StudioPresetShelf';
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
