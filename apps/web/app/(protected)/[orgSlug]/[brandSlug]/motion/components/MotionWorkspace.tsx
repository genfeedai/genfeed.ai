'use client';

import AgentOutputShell from '@ui/layout/agent-output-layout/AgentOutputShell';
import { useTranslations } from 'next-intl';
import type { ReactElement } from 'react';
import MotionNewPane from './MotionNewPane';
import MotionProjectList from './MotionProjectList';

/**
 * Motion with no project open: the prompt that starts one on the left, the
 * brand's visual projects on the right. Opening a project keeps the same split.
 */
export default function MotionWorkspace(): ReactElement {
  const t = useTranslations('pages.studioMotion');
  return (
    <AgentOutputShell
      agent={<MotionNewPane />}
      agentTitle={t('newProject')}
      outputLabel={t('allProjects')}
    >
      <MotionProjectList />
    </AgentOutputShell>
  );
}
