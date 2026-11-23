import type { LayoutProps } from '@props/layout/layout.props';
import PublicShell from '@ui/shell/PublicShell';
import CreatorTopbar from '@web-components/creator/CreatorTopbar';

/** Prototype only: the same shell the creator showcase wears. */
export default function ProtoProfileLayout({ children }: LayoutProps) {
  return (
    <PublicShell mainClassName="pt-0" topbar={<CreatorTopbar />}>
      {children}
    </PublicShell>
  );
}
