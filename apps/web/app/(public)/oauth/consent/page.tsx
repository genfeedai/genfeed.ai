import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';
import OAuthConsentFallback from './consent-fallback';
import OAuthConsentContent from './content';

export const generateMetadata = createPageMetadata('Authorize Access');

export default function OAuthConsentPage() {
  return (
    <Suspense fallback={<OAuthConsentFallback />}>
      <OAuthConsentContent />
    </Suspense>
  );
}
