import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { normalizeSignupReferralCode } from '@genfeedai/helpers';
import type { MakeYourOwnBannerProps } from '@props/content/creator.props';
import ButtonTracked from '@web-components/buttons/tracked/ButtonTracked';
import { getProfileSignupHref } from '@web-components/profile/ProfileSignupCta';
import { ArrowRight } from 'lucide-react';

/**
 * The end of an article: the reader has just seen what the creator made, so
 * this is where they are offered to make their own, with the creator's
 * referral code carried into sign-up.
 */
export default function MakeYourOwnBanner({
  handle,
  referralCode,
}: MakeYourOwnBannerProps): React.ReactElement {
  return (
    <section
      aria-labelledby="make-your-own-heading"
      className="flex flex-col gap-4 border border-primary/30 bg-primary/10 p-6 md:flex-row md:items-center md:justify-between"
    >
      <div className="min-w-0 space-y-1">
        <h2
          className="text-lg font-semibold text-foreground"
          id="make-your-own-heading"
        >
          Want to make your own?
        </h2>
        <p className="text-sm text-foreground/70">
          Go from a brief to articles, images and videos like these with
          Genfeed.
        </p>
      </div>
      <ButtonTracked
        asChild
        variant={ButtonVariant.DEFAULT}
        size={ButtonSize.PUBLIC}
        withWrapper={false}
        trackingName="signup_cta_click"
        trackingData={{
          action: 'article_make_your_own',
          hasReferralCode: Boolean(normalizeSignupReferralCode(referralCode)),
          label: 'Start creating',
          profile: handle,
        }}
      >
        <a
          className="shrink-0"
          href={getProfileSignupHref(referralCode)}
          rel="noopener noreferrer"
          target="_blank"
        >
          Start creating
          <ArrowRight className="size-4" aria-hidden="true" />
        </a>
      </ButtonTracked>
    </section>
  );
}
