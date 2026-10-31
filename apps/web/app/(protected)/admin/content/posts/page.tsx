import AdminPostsRoute from '@app/(protected)/admin/content/posts/AdminPostsRoute';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Posts');

export default function AdminPostsPage() {
  return (
    <Suspense fallback={null}>
      <AdminPostsRoute />
    </Suspense>
  );
}
