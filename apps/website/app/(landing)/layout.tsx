import type { LayoutProps } from '@props/layout/layout.props';
import { EnvironmentService } from '@services/core/environment.service';
import PublicShell from '@ui/shell/PublicShell';
import LandingTopbar from '@ui/shell/topbars/LandingTopbar';

export default function LandingLayout({ children }: LayoutProps) {
  return (
    <PublicShell
      overlay={
        <div className="pointer-events-none fixed inset-0 z-0 bg-dots opacity-40" />
      }
      topbar={
        <LandingTopbar
          ctaHref={EnvironmentService.calendly}
          ctaLabel="Book a Call"
        />
      }
    >
      {children}
    </PublicShell>
  );
}
