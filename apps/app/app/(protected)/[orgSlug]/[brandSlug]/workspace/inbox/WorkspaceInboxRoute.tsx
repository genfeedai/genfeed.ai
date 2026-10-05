'use client';

import WorkspacePageContent from '@app/(protected)/[orgSlug]/[brandSlug]/workspace/workspace-page';
import { useSearchParams } from 'next/navigation';

export default function WorkspaceInboxRoute() {
  const searchParams = useSearchParams();
  const viewValues = searchParams.getAll('view');
  const view = viewValues.length > 1 ? viewValues : viewValues[0];
  const inboxView = view === 'all' || view === 'recent' ? view : 'unread';
  return <WorkspacePageContent defaultInboxView={inboxView} section="inbox" />;
}
