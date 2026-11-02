'use client';

import AgentOutputShell from '@ui/layout/agent-output-layout/AgentOutputShell';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import EditorCreatePane from './EditorCreatePane';
import EditorProjectsPane from './EditorProjectsPane';
import EditorVideoImport from './EditorVideoImport';

/**
 * The Editor with no project open: the prompt that starts one on the left, the
 * brand's projects on the right. Library videos (`?video=<id>`, repeated) become
 * a seeded project and open straight away.
 */
export default function EditorWorkspace() {
  const t = useTranslations('pages.studioEditor');
  const videoIds = useSearchParams().getAll('video').filter(Boolean);

  if (videoIds.length > 0) return <EditorVideoImport videoIds={videoIds} />;

  return (
    <AgentOutputShell
      agent={<EditorCreatePane />}
      agentTitle={t('createProject')}
      outputLabel={t('allProjects')}
    >
      <EditorProjectsPane />
    </AgentOutputShell>
  );
}
