import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';
import type { DetailPageProps } from '@/props/pages/page.props';
import PublishingPostContent from './publishing-post-content';

export const generateMetadata = createPageMetadata('Edit content');

/**
 * Type-aware Publishing content desk. The canonical route composes the existing
 * social post, article, and newsletter editor surfaces.
 *
 * The id is read inside the boundary: awaiting it here would make the whole
 * page a request-time hole, so a prepared destination would still wait for the
 * server render on click.
 */
export default function PublishingPostPage({ params }: DetailPageProps) {
  return (
    <Suspense fallback={null}>
      <PublishingPostContent params={params} />
    </Suspense>
  );
}
