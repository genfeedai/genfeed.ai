import type { LayoutProps } from '@props/layout/layout.props';
import PublicShell from '@ui/shell/PublicShell';
import CreatorFooter from '@web-components/creator/CreatorFooter';
import CreatorTopbar from '@web-components/creator/CreatorTopbar';

const TOPBAR = <CreatorTopbar />;

/**
 * Creator profiles and their articles carry a slim bar and a one-line footer:
 * readers arrive from social to see the creator, and the footer keeps every
 * page from being a crawl dead end. Invite links sit outside this group and
 * keep their bare frame.
 */
export default function CreatorShowcaseLayout({ children }: LayoutProps) {
  return (
    <PublicShell
      overlay={
        <div className="pointer-events-none fixed inset-0 z-0 bg-dots opacity-40" />
      }
      mainClassName="pt-0"
      topbar={TOPBAR}
    >
      {children}
      <CreatorFooter />
    </PublicShell>
  );
}
