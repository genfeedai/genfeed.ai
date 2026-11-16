import type { OrgRootAppEntryPageProps } from '@/props/layout/org-root-app-page.props';
import OrgRootAppEntry from '../../[orgRootApp]/[[...segments]]/org-root-app-entry';
import OrgLibrarySurface from './org-library-surface';

export default function OrgLibraryPage(props: OrgRootAppEntryPageProps) {
  return (
    <OrgRootAppEntry>
      <OrgLibrarySurface {...props} />
    </OrgRootAppEntry>
  );
}
