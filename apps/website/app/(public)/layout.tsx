import type { LayoutProps } from '@props/layout/layout.props';
import PublicShell from '@ui/shell/PublicShell';
import WebsiteTopbar from '@ui/shell/topbars/WebsiteTopbar';

export default function PublicLayout({ children }: LayoutProps) {
  return (
    <PublicShell
      overlay={
        <div className="pointer-events-none fixed inset-0 z-0 bg-dots opacity-40" />
      }
      topbar={<WebsiteTopbar />}
    >
      {children}
    </PublicShell>
  );
}
