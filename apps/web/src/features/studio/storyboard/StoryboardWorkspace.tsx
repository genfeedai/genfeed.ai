'use client';

import CreativeAppWorkspace from '@ui/layout/creative-app-workspace/CreativeAppWorkspace';
import { useTranslations } from 'next-intl';
import StoryboardNewPane from '@/features/studio/storyboard/components/StoryboardNewPane';
import StoryboardRunsList from '@/features/studio/storyboard/StoryboardRunsList';

/**
 * Storyboard with no run open: the prompt that starts one on the left, the
 * brand's runs on the right (once there is one). Opening a run keeps the same split.
 */
export default function StoryboardWorkspace() {
  const translate = useTranslations('pages.studioStoryboard');
  return (
    <CreativeAppWorkspace
      agent={<StoryboardNewPane />}
      agentTitle={translate('agentThread.title')}
      outputLabel={translate('runs.all')}
    >
      <StoryboardRunsList />
    </CreativeAppWorkspace>
  );
}
