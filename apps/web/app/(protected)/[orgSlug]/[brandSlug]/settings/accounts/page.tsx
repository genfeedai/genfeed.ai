import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';
import BrandConnectedAccountsPage from './content';

export const generateMetadata = createPageMetadata('Connected accounts');

export default function BrandConnectedAccountsRoute() {
  return (
    <Suspense fallback={null}>
      <BrandConnectedAccountsPage />
    </Suspense>
  );
}
