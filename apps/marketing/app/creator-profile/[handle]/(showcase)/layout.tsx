import type { CreatorRouteProps } from '@props/content/creator.props';
import type { LayoutProps } from '@props/layout/layout.props';
import PublicShell from '@ui/shell/PublicShell';
import CreatorFooter from '@web-components/creator/CreatorFooter';
import CreatorTopbar from '@web-components/creator/CreatorTopbar';
import { getPublicReferralCodeBySlug } from './creator-loader';

const TOPBAR = <CreatorTopbar />;

/**
 * Creator profiles and their articles carry a slim bar and a one-line footer:
 * readers arrive from social to see the creator, and the footer keeps every
 * page from being a crawl dead end. Invite links sit outside this group and
 * keep their bare frame. The footer holds the secondary Join Genfeed action.
 */
export default async function CreatorShowcaseLayout({
  children,
  params,
}: LayoutProps & CreatorRouteProps) {
  const { handle } = await params;
  const referralCode = await getPublicReferralCodeBySlug(handle);

  return (
    <PublicShell mainClassName="pt-0" topbar={TOPBAR}>
      {children}
      <CreatorFooter handle={handle} referralCode={referralCode} />
    </PublicShell>
  );
}
