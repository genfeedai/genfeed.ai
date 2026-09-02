import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import type { DetailPageProps } from '@props/pages/page.props';
import ExecutionDetailPage from '@/features/workflows/pages/executions/ExecutionDetailPage';

export const generateMetadata = createPageMetadata('Workflow Run');

export default async function WorkflowRunDetailPage({
  params,
}: DetailPageProps) {
  const { id } = await params;

  return <ExecutionDetailPage executionId={id} />;
}
