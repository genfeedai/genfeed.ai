import { PageScope } from '@genfeedai/enums';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import PageLoadingState from '@ui/loading/page/PageLoadingState';
import { Suspense } from 'react';
import PresetsList from './presets-list';

export const generateMetadata = createPageMetadata('Presets');

export default function PresetsPage() {
  return (
    <Suspense fallback={<PageLoadingState />}>
      <PresetsList scope={PageScope.SUPERADMIN} />
    </Suspense>
  );
}
