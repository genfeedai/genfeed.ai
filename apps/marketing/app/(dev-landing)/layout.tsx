import { getAppSignUpUrl } from '@data/app-links';
import type { LayoutProps } from '@props/layout/layout.props';
import PublicShell from '@ui/shell/PublicShell';
import LandingTopbar from '@web-components/shell/topbars/LandingTopbar';

const topbar = (
  <LandingTopbar
    ctaHref={getAppSignUpUrl()}
    ctaLabel="Start creating"
    hideActionWhileVisible="[data-hero-cta]"
  />
);

export default function DevLandingLayout({ children }: LayoutProps) {
  return <PublicShell topbar={topbar}>{children}</PublicShell>;
}
