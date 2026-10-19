import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';
import AdminAgentsPage from './admin-agents-page';

export const generateMetadata = createPageMetadata('Agents');

export default function AgentsPage() {
  return (
    <Suspense fallback={null}>
      <AdminAgentsPage />
    </Suspense>
  );
}
