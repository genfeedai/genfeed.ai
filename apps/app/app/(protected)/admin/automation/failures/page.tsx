import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';
import AgentFailuresPage from './content';

export const generateMetadata = createPageMetadata('Agent Failures');

export default function AgentFailuresPageWrapper() {
  return (
    <Suspense fallback={null}>
      <AgentFailuresPage />
    </Suspense>
  );
}
