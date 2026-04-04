'use client';

import { WorkflowEditor } from '@genfeedai/workflow';
import WorkflowEditorToolbarNavigation from '../components/WorkflowEditorToolbarNavigation';

interface WorkflowDetailPageClientProps {
  workflowId: string;
  initialExecutionId?: string;
}

export default function WorkflowDetailPageClient({
  workflowId,
  initialExecutionId,
}: WorkflowDetailPageClientProps) {
  return (
    <WorkflowEditor
      initialExecutionId={initialExecutionId}
      workflowId={workflowId}
      logoHref="/workflows"
      toolbarLeftContent={<WorkflowEditorToolbarNavigation />}
    />
  );
}
