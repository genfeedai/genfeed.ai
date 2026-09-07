import type { DetailPageProps } from '@props/pages/page.props';

export interface WorkflowDetailPageProps extends DetailPageProps {
  searchParams: Promise<{ execution?: string }>;
}
