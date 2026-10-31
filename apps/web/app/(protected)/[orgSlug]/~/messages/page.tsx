import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';
import MessagesPage from '../../[brandSlug]/messages/messages-page';

export const generateMetadata = createPageMetadata('Messages');

export default function OrganizationMessagesPage() {
  return (
    <Suspense fallback={null}>
      <MessagesPage />
    </Suspense>
  );
}
