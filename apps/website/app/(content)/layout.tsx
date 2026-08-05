import type { LayoutProps } from '@props/layout/layout.props';
import PublicShell from '@ui/shell/PublicShell';
import HomeFooter from '@web-components/home/_footer';

/**
 * The topbar is hidden here, and nothing under `(content)` uses PageLayout, so
 * without this footer every article page was a crawl dead end — the 5 Aug 2026
 * audit saw `/articles` with zero internal outlinks.
 */
export default function ContentLayout({ children }: LayoutProps) {
  return (
    <PublicShell
      overlay={
        <div className="pointer-events-none fixed inset-0 z-0 bg-dots opacity-40" />
      }
      isTopbarVisible={false}
      mainClassName="pt-0"
    >
      {children}
      <HomeFooter />
    </PublicShell>
  );
}
