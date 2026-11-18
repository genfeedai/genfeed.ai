import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import TopbarLogo from '@ui/topbars/logo/TopbarLogo';
import ButtonTracked from '@web-components/buttons/tracked/ButtonTracked';
import { getProfileSignupHref } from '@web-components/profile/ProfileSignupCta';

/**
 * The bar above a creator's page: the logo and one way in. The site menu is
 * left out because a visitor came to see this creator, not to browse Genfeed.
 */
export default function CreatorTopbar(): React.ReactElement {
  return (
    <header className="sticky top-0 z-50 border-b border-foreground/10 bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between px-4 lg:px-6">
        <TopbarLogo logoHref="/" />
        <ButtonTracked
          asChild
          size={ButtonSize.PUBLIC}
          trackingData={{
            action: 'creator_topbar_cta',
            label: 'Make your own',
          }}
          trackingName="signup_cta_click"
          variant={ButtonVariant.SECONDARY}
          withWrapper={false}
        >
          <a
            href={getProfileSignupHref()}
            rel="noopener noreferrer"
            target="_blank"
          >
            Make your own
          </a>
        </ButtonTracked>
      </div>
    </header>
  );
}
