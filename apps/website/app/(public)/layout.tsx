import type { LayoutProps } from '@props/layout/layout.props';
import PublicShell from '@ui/shell/PublicShell';
import WebsiteTopbar from '@ui/shell/topbars/WebsiteTopbar';

const TOPBAR = <WebsiteTopbar />;

export default function PublicLayout({ children }: LayoutProps) {
  return <PublicShell topbar={TOPBAR}>{children}</PublicShell>;
}
