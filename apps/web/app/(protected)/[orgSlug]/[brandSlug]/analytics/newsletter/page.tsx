import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';
import NewsletterAnalyticsPage from '@/features/newsletter/analytics/NewsletterAnalyticsPage';

export const generateMetadata = createPageMetadata('Newsletter Analytics');

export default function AnalyticsNewsletterPage() {
  return (
    <Suspense fallback={null}>
      <NewsletterAnalyticsPage />
    </Suspense>
  );
}
