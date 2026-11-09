import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';
import NewsletterSettingsPage from '@/features/newsletter/settings/NewsletterSettingsPage';

export const generateMetadata = createPageMetadata('Newsletter Settings');

export default function PublishingNewsletterSettingsPageRoute() {
  return (
    <Suspense fallback={null}>
      <NewsletterSettingsPage />
    </Suspense>
  );
}
