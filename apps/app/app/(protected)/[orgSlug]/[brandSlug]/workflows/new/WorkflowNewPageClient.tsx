'use client';

import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { WorkflowEditor } from '@/features/workflows/components/WorkflowEditor';
import WorkflowEditorToolbarNavigation from '../components/WorkflowEditorToolbarNavigation';

export default function WorkflowNewPageClient() {
  const { href } = useOrgUrl();

  return (
    <WorkflowEditor
      logoHref={href('/workflows')}
      toolbarLeftContent={<WorkflowEditorToolbarNavigation />}
    />
  );
}
