import type { OrgRootAppEntryPageProps } from '@/props/layout/org-root-app-page.props';
import OrgRootAppEntry from '../../[orgRootApp]/[[...segments]]/org-root-app-entry';
import OrgPublishingSurface from './org-publishing-surface';

export default function OrgPublishingPage(props: OrgRootAppEntryPageProps) {
  return (
    <OrgRootAppEntry>
      <OrgPublishingSurface {...props} />
    </OrgRootAppEntry>
  );
}
