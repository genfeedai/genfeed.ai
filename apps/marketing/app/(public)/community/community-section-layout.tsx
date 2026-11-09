import type { CommunitySectionLayoutProps } from '@props/content/creator.props';
import CommunityNav from '@web-components/creator/CommunityNav';
import HomeFooter from '@web-components/home/_footer';

/** One community section page: its heading, the sub-nav, then its listing. */
export default function CommunitySectionLayout({
  active,
  children,
  description,
  title,
}: CommunitySectionLayoutProps): React.ReactElement {
  return (
    <>
      <div className="mx-auto w-full max-w-7xl px-4 pb-24 pt-12 sm:px-6">
        <header className="mb-8 max-w-3xl">
          <h1 className="mb-3 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            {title}
          </h1>
          <p className="text-base text-foreground/70">{description}</p>
        </header>
        <CommunityNav active={active} />
        {children}
      </div>
      <HomeFooter />
    </>
  );
}
