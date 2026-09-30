import type { PageLayoutProps } from '@props/layout/page-layout.props';
import PosterHeroPage from '@ui/marketing/PosterHeroPage';
import ProofHeroPage from '@ui/marketing/ProofHeroPage';
import HomeFooter from '@web-components/home/_footer';

export default function PageLayout({
  children,
  badge,
  badgeIcon: BadgeIcon,
  compact,
  description,
  heroActions,
  heroDetails,
  heroProof,
  heroMedia,
  heroVisual,
  showFooter = true,
  title,
  variant = 'poster',
}: PageLayoutProps): React.ReactElement {
  const visual = heroMedia ? (
    <div className="w-full space-y-5">
      {heroMedia}
      {heroVisual}
    </div>
  ) : (
    heroVisual
  );

  const pageBody = (
    <>
      {children}
      {showFooter ? <HomeFooter /> : null}
    </>
  );

  if (variant === 'proof') {
    return (
      <ProofHeroPage
        badge={badge}
        badgeIcon={BadgeIcon}
        compact={compact}
        description={description}
        heroActions={heroActions}
        heroProof={heroProof}
        heroVisual={visual}
        title={title}
      >
        {pageBody}
      </ProofHeroPage>
    );
  }

  return (
    <PosterHeroPage
      badge={badge}
      badgeIcon={BadgeIcon}
      compact={compact}
      description={description}
      heroActions={heroActions}
      heroDetails={heroDetails}
      heroVisual={visual}
      title={title}
    >
      {pageBody}
    </PosterHeroPage>
  );
}
