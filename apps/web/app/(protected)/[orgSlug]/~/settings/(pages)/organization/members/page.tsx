import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import MembersList from '@pages/members/list/members-list';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Team Members');

export default function SettingsOrganizationMembersRoute() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <MembersList />
    </Suspense>
  );
}
