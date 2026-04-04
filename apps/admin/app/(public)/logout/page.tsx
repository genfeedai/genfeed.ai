import LazyLoadingFallback from '@components/loading/fallback/LazyLoadingFallback';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import LogoutForm from '@pages/logout/logout-form';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Logout');

export default function LogoutPage() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <LogoutForm />
    </Suspense>
  );
}
