'use client';

import { WorkflowEditor } from '@genfeedai/workflow';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import WorkflowEditorToolbarNavigation from '../components/WorkflowEditorToolbarNavigation';

interface WorkflowDetailPageClientProps {
  workflowId: string;
  initialExecutionId?: string;
}

export default function WorkflowDetailPageClient({
  workflowId,
  initialExecutionId,
}: WorkflowDetailPageClientProps) {
  const { href } = useOrgUrl();

  return (
    <WorkflowEditor
      initialExecutionId={initialExecutionId}
      workflowId={workflowId}
      logoHref={href('/workflows')}
      toolbarLeftContent={<WorkflowEditorToolbarNavigation />}
    />
  );
}
