import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { resolveAdminModelType } from '@props/admin/models.props';
import type { FilterPageProps } from '@props/pages/page.props';
import { Suspense } from 'react';
import AdminModelsPageContent from './[type]/admin-models-page-content';

export const generateMetadata = createPageMetadata('Models');

export default async function FilteredListPage({
  searchParams,
}: FilterPageProps) {
  const { type: value } = await searchParams;
  const selected = resolveAdminModelType(value);
  return (
    <Suspense fallback={null}>
      <AdminModelsPageContent type={selected} />
    </Suspense>
  );
}
