import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';
import MessagesPage from './messages-page';

export const generateMetadata = createPageMetadata('Messages');

export default function SocialMessagesPage() {
  return (
    <Suspense fallback={null}>
      <MessagesPage />
    </Suspense>
  );
}
