import { BOOKING_HREF } from '@data/booking.data';
import type { LayoutProps } from '@props/layout/layout.props';
import { EnvironmentService } from '@services/core/environment.service';
import PublicShell from '@ui/shell/PublicShell';
import LandingTopbar from '@ui/shell/topbars/LandingTopbar';

const overlay = (
  <div className="pointer-events-none fixed inset-0 z-0 bg-dots opacity-40" />
);

// Every landing page offers both paths: self-serve sign-up and a call, booked
// on the done-for-you page's calendar.
const topbar = (
  <LandingTopbar
    ctaHref={`${EnvironmentService.apps.app}/sign-up`}
    ctaLabel="Start free"
    secondaryCtaHref={BOOKING_HREF}
    secondaryCtaLabel="Book a call"
  />
);

export default function LandingLayout({ children }: LayoutProps) {
  return (
    <PublicShell overlay={overlay} topbar={topbar}>
      {children}
    </PublicShell>
  );
}
