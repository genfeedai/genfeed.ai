import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import MembersList from '../../(pages)/organization/members/members-list';

export const generateMetadata = createPageMetadata('Team Members');

export default function SettingsOrganizationMembersRoute() {
  return <MembersList />;
}
