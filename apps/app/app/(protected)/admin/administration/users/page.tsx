import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import UsersList from '@protected/administration/users/users-list';
import PageLoadingState from '@ui/loading/page/PageLoadingState';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Users');

export default function UsersPage() {
  return (
    <Suspense fallback={<PageLoadingState />}>
      <UsersList />
    </Suspense>
  );
}
