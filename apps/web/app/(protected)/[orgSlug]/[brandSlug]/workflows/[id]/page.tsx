import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import type { DetailPageProps } from '@props/pages/page.props';
import WorkflowDetailPageClient from './WorkflowDetailPageClient';

export const generateMetadata = createPageMetadata('Agent Workflow Editor');

interface WorkflowDetailPageProps extends DetailPageProps {
  searchParams: Promise<{ execution?: string }>;
}

export default async function WorkflowDetailPage({
  params,
  searchParams,
}: WorkflowDetailPageProps) {
  const { id } = await params;
  const { execution } = await searchParams;

  return (
    <WorkflowDetailPageClient initialExecutionId={execution} workflowId={id} />
  );
}
