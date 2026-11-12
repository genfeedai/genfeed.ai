import OrgRootAppEntry, {
  type OrgRootAppEntryPageProps,
} from '../../[orgRootApp]/[[...segments]]/org-root-app-entry';

export default function OrgPublishingPage(props: OrgRootAppEntryPageProps) {
  return <OrgRootAppEntry orgRootApp="publishing" {...props} />;
}
