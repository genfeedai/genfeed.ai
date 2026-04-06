'use client';

import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { WorkflowEditor } from '@/features/workflows/components/WorkflowEditor';
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
