import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import type { FilterPageProps } from '@props/pages/page.props';
import { Suspense } from 'react';
import ModelsTypePageClientContent from './[type]/page-content';

export const generateMetadata = createPageMetadata('Models');

export default async function FilteredListPage({
  searchParams,
}: FilterPageProps) {
  const { type: value } = await searchParams;
  // Catalog group keys (image, video, …) and `trainings`; the list resolves
  // anything else to the unfiltered catalog.
  const selected = typeof value === 'string' && value ? value : 'all';
  return (
    <Suspense fallback={null}>
      <ModelsTypePageClientContent type={selected} />
    </Suspense>
  );
}
