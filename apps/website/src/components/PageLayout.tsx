import type { PageLayoutProps } from '@props/layout/page-layout.props';
import HomeFooter from '@web-components/home/_footer';
import PosterHeroPage from '@web-components/marketing/PosterHeroPage';
import ProofHeroPage from '@web-components/marketing/ProofHeroPage';

export default function PageLayout({
  children,
  compact,
  description,
  heroActions,
  heroDetails,
  heroProof,
  heroMedia,
  heroVisual,
  isHeroVisualStacked,
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
      compact={compact}
      description={description}
      heroActions={heroActions}
      heroDetails={heroDetails}
      heroVisual={visual}
      isHeroVisualStacked={isHeroVisualStacked}
      title={title}
    >
      {pageBody}
    </PosterHeroPage>
  );
}
