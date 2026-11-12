import type { OrgRootAppEntryPageProps } from '@/props/layout/org-root-app-page.props';
import OrgRootAppEntry from '../../[orgRootApp]/[[...segments]]/org-root-app-entry';

export default function OrgPublishingPage(props: OrgRootAppEntryPageProps) {
  return <OrgRootAppEntry orgRootApp="publishing" {...props} />;
}
