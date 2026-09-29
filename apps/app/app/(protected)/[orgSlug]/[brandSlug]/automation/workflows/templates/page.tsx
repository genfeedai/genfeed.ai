import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import type { BrandAppPageProps } from '@props/pages/page.props';
import { redirect } from 'next/navigation';
import { workflowTemplatesTabPath } from '@/features/workflows/pages/workflow-library-tabs';

export const generateMetadata = createPageMetadata('Workflow Templates');

export default async function WorkflowTemplatesRedirectPage({
  params,
  searchParams,
}: BrandAppPageProps) {
  const { brandSlug, orgSlug } = await params;
  const query = searchParams ? await searchParams : {};
  redirect(`/${orgSlug}/${brandSlug}${workflowTemplatesTabPath(query)}`);
}
