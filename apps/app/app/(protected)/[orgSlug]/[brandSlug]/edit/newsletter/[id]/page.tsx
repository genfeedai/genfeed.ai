import NewsletterEditorRoute from '@app/(protected)/[orgSlug]/[brandSlug]/edit/newsletter/[id]/NewsletterEditorRoute';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Edit Newsletter');

export default function NewsletterEditorPage() {
  return (
    <Suspense fallback={null}>
      <NewsletterEditorRoute />
    </Suspense>
  );
}
