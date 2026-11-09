import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';
import NewsletterSubscribersPage from '@/features/newsletter/subscribers/NewsletterSubscribersPage';

export const generateMetadata = createPageMetadata('Newsletter');

export default function PublishingNewsletterPageRoute() {
  return (
    <Suspense fallback={null}>
      <NewsletterSubscribersPage />
    </Suspense>
  );
}
