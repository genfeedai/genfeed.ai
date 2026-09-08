import { PageScope } from '@genfeedai/contracts';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import type { TagsFilterPageProps } from '@props/pages/page.props';
import { Suspense } from 'react';
import TagsPage from './tags-page';

export const generateMetadata = createPageMetadata('Tags');

export default async function TagsFilterPage({ params }: TagsFilterPageProps) {
  const { filter } = await params;

  return (
    <Suspense fallback={null}>
      <TagsPage scope={PageScope.SUPERADMIN} filter={filter} />
    </Suspense>
  );
}
