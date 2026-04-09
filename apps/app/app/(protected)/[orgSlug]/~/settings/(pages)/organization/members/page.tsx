import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { Suspense } from 'react';
import MembersList from './members-list';

export const generateMetadata = createPageMetadata('Team Members');

export default function SettingsOrganizationMembersRoute() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <MembersList />
    </Suspense>
  );
}
