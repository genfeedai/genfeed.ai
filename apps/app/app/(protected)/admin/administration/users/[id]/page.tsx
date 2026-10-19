import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import UserDetailPage from '@protected/administration/users/user-detail-page';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('User');

export default function AdminUserDetailPage() {
  return (
    <Suspense fallback={null}>
      <UserDetailPage />
    </Suspense>
  );
}
