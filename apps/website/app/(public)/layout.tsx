import type { LayoutProps } from '@props/layout/layout.props';
import PublicShell from '@ui/shell/PublicShell';
import WebsiteTopbar from '@ui/shell/topbars/WebsiteTopbar';

const OVERLAY = (
  <div className="pointer-events-none fixed inset-0 z-0 bg-dots opacity-40" />
);
const TOPBAR = <WebsiteTopbar />;

export default function PublicLayout({ children }: LayoutProps) {
  return (
    <PublicShell overlay={OVERLAY} topbar={TOPBAR}>
      {children}
    </PublicShell>
  );
}
