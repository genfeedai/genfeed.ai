import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { Suspense } from 'react';
import MessagesPage from './messages-page';

export const generateMetadata = createPageMetadata('Messages');

export default function SocialMessagesPage() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <MessagesPage />
    </Suspense>
  );
}
