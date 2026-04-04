import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import SettingsConversationPage from '@pages/settings/conversation/settings-conversation-page';
import SettingsProfilePage from '@pages/settings/profile/settings-profile-page';
import SettingsProgressPage from '@pages/settings/progress/settings-progress-page';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { Suspense } from 'react';

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
