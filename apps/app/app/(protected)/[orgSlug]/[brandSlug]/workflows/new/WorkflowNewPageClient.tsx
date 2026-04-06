'use client';

import { WorkflowEditor } from '@genfeedai/workflow';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
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
