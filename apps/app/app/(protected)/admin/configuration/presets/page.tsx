import LazyLoadingFallback from '@components/loading/fallback/LazyLoadingFallback';
import { PageScope } from '@genfeedai/enums';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';
import PresetsList from './presets-list';

export const generateMetadata = createPageMetadata('Presets');

export default function PresetsPage() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <PresetsList scope={PageScope.SUPERADMIN} />
    </Suspense>
  );
}
