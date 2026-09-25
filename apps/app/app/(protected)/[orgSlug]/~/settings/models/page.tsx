import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import type { FilterPageProps } from '@props/pages/page.props';
import { Suspense } from 'react';
import ModelsTypePageClientContent from './[type]/page-content';

export const generateMetadata = createPageMetadata('Models');

export default async function FilteredListPage({
  searchParams,
}: FilterPageProps) {
  const { type: value } = await searchParams;
  const selected =
    value === 'images' ||
    value === 'videos' ||
    value === 'text' ||
    value === 'trainings'
      ? value
      : 'all';
  return (
    <Suspense fallback={null}>
      <ModelsTypePageClientContent type={selected} />
    </Suspense>
  );
}
