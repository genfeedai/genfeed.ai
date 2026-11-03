import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import UsersList from '@protected/users/users-list';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Users');

export default function UsersPage() {
  return (
    <Suspense fallback={null}>
      <UsersList />
    </Suspense>
  );
}
