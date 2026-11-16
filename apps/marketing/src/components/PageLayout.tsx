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
  heroVisual,
  isHeroVisualStacked,
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
        compact={compact}
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
      compact={compact}
      description={description}
      heroActions={heroActions}
      heroDetails={heroDetails}
      heroVisual={heroVisual}
      isHeroVisualStacked={isHeroVisualStacked}
      title={title}
    >
      {pageBody}
    </PosterHeroPage>
  );
}
