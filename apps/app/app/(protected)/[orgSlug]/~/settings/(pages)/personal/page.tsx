import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { Suspense } from 'react';
import SettingsConversationPage from './settings-conversation-page';
import SettingsProfilePage from './settings-profile-page';
import SettingsProgressPage from './settings-progress-page';

export const generateMetadata = createPageMetadata('Personal Settings');

export default function SettingsPersonalPage() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <div className="space-y-6">
        <SettingsProfilePage />
        <SettingsConversationPage showReplyStyle={false} />
        <SettingsProgressPage showOverviewCard={false} />
      </div>
    </Suspense>
  );
}
