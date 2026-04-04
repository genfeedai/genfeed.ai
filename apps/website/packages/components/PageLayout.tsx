'use client';

import type { PageLayoutProps } from '@props/layout/page-layout.props';
import PosterHeroPage from '@ui/marketing/PosterHeroPage';
import ProofHeroPage from '@ui/marketing/ProofHeroPage';
import HomeFooter from '@web-components/home/_footer';

export default function PageLayout({
  children,
  badge,
  badgeIcon: BadgeIcon,
  description,
  heroActions,
  heroDetails,
  heroProof,
  heroVisual,
  showFooter = true,
  title,
  variant = 'poster',
}: PageLayoutProps): React.ReactElement {
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
        description={description}
        heroActions={heroActions}
        heroProof={heroProof}
        heroVisual={heroVisual}
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
      description={description}
      heroActions={heroActions}
      heroDetails={heroDetails}
      heroVisual={heroVisual}
      title={title}
    >
      {pageBody}
    </PosterHeroPage>
  );
}
