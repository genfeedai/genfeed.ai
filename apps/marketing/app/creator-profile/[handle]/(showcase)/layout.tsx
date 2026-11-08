import type { LayoutProps } from '@props/layout/layout.props';
import PublicShell from '@ui/shell/PublicShell';
import HomeFooter from '@web-components/home/_footer';
import WebsiteTopbar from '@web-components/shell/topbars/WebsiteTopbar';

const TOPBAR = <WebsiteTopbar />;

/**
 * Creator profiles and their articles carry the site's topbar and footer:
 * readers arrive from social, and the footer keeps every page from being a
 * crawl dead end. Invite links sit outside this group and keep their bare
 * frame.
 */
export default function CreatorShowcaseLayout({ children }: LayoutProps) {
  return (
    <PublicShell
      overlay={
        <div className="pointer-events-none fixed inset-0 z-0 bg-dots opacity-40" />
      }
      topbar={TOPBAR}
    >
      {children}
      <HomeFooter />
    </PublicShell>
  );
}
