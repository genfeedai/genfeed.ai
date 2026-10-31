import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';
import AgentHubPage from './AgentHubPage';

export const generateMetadata = createPageMetadata('Agents');

export default function AutomationAgentsPage() {
  return (
    <Suspense fallback={null}>
      <AgentHubPage />
    </Suspense>
  );
}
