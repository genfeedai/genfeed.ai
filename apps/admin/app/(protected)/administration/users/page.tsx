import { SkeletonLoadingFallback } from '@components/loading/skeleton/SkeletonFallbacks';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import UsersList from '@protected/administration/users/users-list';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Users');

export default function UsersPage() {
  return (
    <Suspense fallback={<SkeletonLoadingFallback />}>
      <UsersList />
    </Suspense>
  );
}
