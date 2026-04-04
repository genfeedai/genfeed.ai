import LazyLoadingFallback from '@components/loading/fallback/LazyLoadingFallback';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import PresetsList from '@pages/elements/presets/presets-list';
import { PageScope } from '@ui-constants/misc.constant';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Presets');

export default function PresetsPage() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <PresetsList scope={PageScope.SUPERADMIN} />
    </Suspense>
  );
}
