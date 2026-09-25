import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import type { FilterPageProps } from '@props/pages/page.props';
import { Suspense } from 'react';
import AdminModelsPageContent from './[type]/admin-models-page-content';

export const generateMetadata = createPageMetadata('Models');

export default async function FilteredListPage({
  searchParams,
}: FilterPageProps) {
  const { type: value } = await searchParams;
  const selected =
    value === 'image' ||
    value === 'video' ||
    value === 'music' ||
    value === 'text' ||
    value === 'other'
      ? value
      : 'all';
  return (
    <Suspense fallback={null}>
      <AdminModelsPageContent type={selected} />
    </Suspense>
  );
}
