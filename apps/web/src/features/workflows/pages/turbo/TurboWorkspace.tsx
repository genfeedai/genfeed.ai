'use client';

import AgentOutputShell from '@ui/layout/agent-output-layout/AgentOutputShell';
import { useTranslations } from 'next-intl';
import TurboCreatePane from './TurboCreatePane';
import TurboProjectsList from './TurboProjectsList';

/**
 * Turbo with no project open: the prompt that starts one on the left, the
 * brand's projects on the right. Opening a project keeps the same split.
 */
export default function TurboWorkspace() {
  const t = useTranslations('pages.turboProjects');
  return (
    <AgentOutputShell
      agent={<TurboCreatePane />}
      agentTitle={t('new')}
      outputLabel={t('all')}
    >
      <TurboProjectsList />
    </AgentOutputShell>
  );
}
