import type { LayoutProps } from '@props/layout/layout.props';
import PublicShell from '@ui/shell/PublicShell';

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
    </PublicShell>
  );
}
