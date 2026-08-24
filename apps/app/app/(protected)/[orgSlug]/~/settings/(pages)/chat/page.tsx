import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { Suspense } from 'react';
import SettingsConversationPage from '../personal/settings-conversation-page';

export const generateMetadata = createPageMetadata('Chat Defaults');

export default function SettingsChat() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <SettingsConversationPage showReplyStyle={false} />
    </Suspense>
  );
}
