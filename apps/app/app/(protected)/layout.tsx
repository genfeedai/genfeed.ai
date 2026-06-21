import ProtectedLayoutClient from '@app/(protected)/protected-layout-client';
import type { LayoutProps } from '@props/layout/layout.props';

export default function ProtectedLayout({ children }: LayoutProps) {
  return (
    <ProtectedLayoutClient initialBootstrap={null}>
      {children}
    </ProtectedLayoutClient>
  );
}
