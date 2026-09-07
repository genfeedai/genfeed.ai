import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import type { WorkflowDetailPageProps } from '@props/automation/workflow-detail-page.props';
import { notFound } from 'next/navigation';
import WorkflowDetailPageClient from './WorkflowDetailPageClient';

export const generateMetadata = createPageMetadata('Agent Workflow Editor');

const RESERVED_WORKFLOW_PATHS = new Set(['executions', 'templates']);

export default async function WorkflowDetailPage({
  params,
  searchParams,
}: WorkflowDetailPageProps) {
  const [{ id }, { execution }] = await Promise.all([params, searchParams]);

  if (RESERVED_WORKFLOW_PATHS.has(id)) {
    notFound();
  }

  return (
    <WorkflowDetailPageClient initialExecutionId={execution} workflowId={id} />
  );
}
