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
  articleTitle,
  creatorName,
  handle,
  layout = 'inline',
  referralCode,
}: MakeYourOwnBannerProps): React.ReactElement {
  const isRail = layout === 'rail';
  const headline = `Make content like ${creatorName}'s`;
  const headingId = isRail
    ? 'make-your-own-rail-heading'
    : 'make-your-own-heading';

  return (
    <section
      aria-labelledby={headingId}
      className={
        isRail
          ? 'flex flex-col gap-4 border border-primary/20 bg-primary/10 p-4'
          : 'flex flex-col gap-4 border border-primary/20 bg-primary/10 p-6 md:flex-row md:items-center md:justify-between'
      }
    >
      <div className="min-w-0 space-y-1">
        {isRail ? (
          // The end-of-article band already carries the page's heading, so the
          // rail's copy of the offer is a label, not a second h2.
          <p className="text-base font-semibold text-foreground" id={headingId}>
            {headline}
          </p>
        ) : (
          <h2 className="text-lg font-semibold text-foreground" id={headingId}>
            {headline}
          </h2>
        )}
        {isRail ? null : (
          <p className="text-sm text-foreground/70">
            Go from a brief to articles, images and videos like &ldquo;
            {articleTitle}&rdquo; with Genfeed.
          </p>
        )}
      </div>
      <ButtonTracked
        asChild
        variant={ButtonVariant.DEFAULT}
        size={isRail ? ButtonSize.DEFAULT : ButtonSize.PUBLIC}
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
          className={isRail ? 'w-full' : 'shrink-0'}
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
