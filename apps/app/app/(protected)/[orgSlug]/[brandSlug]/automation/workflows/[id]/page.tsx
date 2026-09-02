import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import type { DetailPageProps } from '@props/pages/page.props';
import { notFound } from 'next/navigation';
import WorkflowDetailPageClient from './WorkflowDetailPageClient';

export const generateMetadata = createPageMetadata('Agent Workflow Editor');

const RESERVED_WORKFLOW_PATHS = new Set(['executions', 'templates']);

interface WorkflowDetailPageProps extends DetailPageProps {
  searchParams: Promise<{ execution?: string }>;
}

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
