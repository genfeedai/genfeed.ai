import OrgRootAppEntry, {
  type OrgRootAppEntryPageProps,
} from '../../[orgRootApp]/[[...segments]]/org-root-app-entry';

export default function OrgLibraryPage(props: OrgRootAppEntryPageProps) {
  return <OrgRootAppEntry orgRootApp="library" {...props} />;
}
