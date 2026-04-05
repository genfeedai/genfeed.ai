'use client';

import { WorkflowEditor } from '@genfeedai/workflow';
import WorkflowEditorToolbarNavigation from '../components/WorkflowEditorToolbarNavigation';

export default function WorkflowNewPageClient() {
  return (
    <WorkflowEditor
      logoHref="/workflows"
      toolbarLeftContent={<WorkflowEditorToolbarNavigation />}
    />
  );
}
