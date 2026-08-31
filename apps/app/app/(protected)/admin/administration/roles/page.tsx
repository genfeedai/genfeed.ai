import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import RolesList from '@protected/administration/roles/roles-list';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Roles');

export default function RolesPage() {
  return (
    <Suspense fallback={null}>
      <RolesList />
    </Suspense>
  );
}
