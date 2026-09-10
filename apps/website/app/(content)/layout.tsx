import type { LayoutProps } from '@props/layout/layout.props';
import PublicShell from '@ui/shell/PublicShell';
import WebsiteTopbar from '@ui/shell/topbars/WebsiteTopbar';
import HomeFooter from '@web-components/home/_footer';

const TOPBAR = <WebsiteTopbar />;

/**
 * Articles carry the same topbar as the rest of the site: they are the entry
 * point for readers arriving from social, and without the bar the only way
 * back into the product was the footer.
 *
 * Nothing under `(content)` uses PageLayout, so the footer stays — it is what
 * keeps every article from being a crawl dead end (5 Aug 2026 audit).
 */
export default function ContentLayout({ children }: LayoutProps) {
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
