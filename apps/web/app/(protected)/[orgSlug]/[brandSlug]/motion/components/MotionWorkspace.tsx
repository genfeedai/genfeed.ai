'use client';

import CreativeAppWorkspace from '@ui/layout/creative-app-workspace/CreativeAppWorkspace';
import { useTranslations } from 'next-intl';
import type { ReactElement } from 'react';
import MotionNewPane from './MotionNewPane';
import MotionProjectList from './MotionProjectList';

/**
 * Motion with no project open: the prompt that starts one on the left, the
 * brand's visual projects on the right (once there is one). Opening a project keeps the same split.
 */
export default function MotionWorkspace(): ReactElement {
  const t = useTranslations('pages.studioMotion');
  return (
    <CreativeAppWorkspace
      agent={<MotionNewPane />}
      agentTitle={t('newProject')}
      outputLabel={t('allProjects')}
    >
      <MotionProjectList />
    </CreativeAppWorkspace>
  );
}
