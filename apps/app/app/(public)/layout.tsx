import type { LayoutProps } from '@props/layout/layout.props';
import AnalyticsPublicRouteSync from '@/components/analytics/AnalyticsPublicRouteSync';

export default function PublicLayout({ children }: LayoutProps) {
  return (
    <>
      <AnalyticsPublicRouteSync />
      {children}
    </>
  );
}
