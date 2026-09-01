import type { LayoutProps } from '@props/layout/layout.props';
import { EnvironmentService } from '@services/core/environment.service';
import PublicShell from '@ui/shell/PublicShell';
import LandingTopbar from '@ui/shell/topbars/LandingTopbar';

const overlay = (
  <div className="pointer-events-none fixed inset-0 z-0 bg-dots opacity-40" />
);

const topbar = (
  <LandingTopbar
    ctaHref={`${EnvironmentService.apps.app}/sign-up`}
    ctaLabel="Start creating"
  />
);

export default function DevLandingLayout({ children }: LayoutProps) {
  return (
    <PublicShell overlay={overlay} topbar={topbar}>
      {children}
    </PublicShell>
  );
}
