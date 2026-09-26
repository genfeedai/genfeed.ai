import type { LayoutProps } from '@props/layout/layout.props';
import { EnvironmentService } from '@services/core/environment.service';
import PublicShell from '@ui/shell/PublicShell';
import LandingTopbar from '@ui/shell/topbars/LandingTopbar';

const overlay = (
  <div className="pointer-events-none fixed inset-0 z-0 bg-dots opacity-40" />
);

// Every landing page offers both paths: self-serve sign-up and a sales call.
const topbar = (
  <LandingTopbar
    ctaHref={`${EnvironmentService.apps.app}/sign-up`}
    ctaLabel="Start free"
    secondaryCtaHref={EnvironmentService.calendly}
    secondaryCtaLabel="Book a Call"
  />
);

export default function LandingLayout({ children }: LayoutProps) {
  return (
    <PublicShell overlay={overlay} topbar={topbar}>
      {children}
    </PublicShell>
  );
}
