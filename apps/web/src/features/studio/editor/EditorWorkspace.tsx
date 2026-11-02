'use client';

import AgentOutputShell from '@ui/layout/agent-output-layout/AgentOutputShell';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { ANALYTICS_EVENTS, captureAnalyticsEvent } from '@/lib/analytics';
import EditorCreatePane from './EditorCreatePane';
import EditorProjectsList from './EditorProjectsList';

/**
 * Editor with no project open: the prompt that starts one on the left, the
 * brand's projects on the right. Opening a project keeps the same split.
 */
export default function EditorWorkspace() {
  const t = useTranslations('pages.studioEditor');
  useEffect(() => {
    captureAnalyticsEvent(ANALYTICS_EVENTS.STUDIO_EDITOR_OPENED, {
      surface: 'index',
    });
  }, []);
  return (
    <AgentOutputShell
      agent={<EditorCreatePane />}
      agentTitle={t('new')}
      outputLabel={t('allProjects')}
    >
      <EditorProjectsList />
    </AgentOutputShell>
  );
}
