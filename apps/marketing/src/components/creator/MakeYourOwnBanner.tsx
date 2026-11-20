import {
  ButtonSize,
  ButtonVariant,
  CardGap,
  CardPadding,
} from '@genfeedai/contracts';
import { normalizeSignupReferralCode } from '@genfeedai/helpers';
import type { MakeYourOwnBannerProps } from '@props/content/creator.props';
import Card from '@ui/card/Card';
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
  layout = 'inline',
  referralCode,
}: MakeYourOwnBannerProps): React.ReactElement {
  const isRail = layout === 'rail';
  const headingId = isRail
    ? 'make-your-own-rail-heading'
    : 'make-your-own-heading';

  return (
    <Card
      aria-labelledby={headingId}
      as="section"
      bodyClassName={
        isRail ? undefined : 'md:flex-row md:items-center md:justify-between'
      }
      gap={CardGap.LG}
      padding={isRail ? CardPadding.LG : CardPadding.XL}
    >
      <div className="min-w-0 space-y-1">
        {isRail ? (
          // The end-of-article band already carries the page's heading, so the
          // rail's copy of the offer is a label, not a second h2.
          <p className="text-base font-semibold text-foreground" id={headingId}>
            Make content like this
          </p>
        ) : (
          <h2 className="text-lg font-semibold text-foreground" id={headingId}>
            Make content like this
          </h2>
        )}
        {isRail ? null : (
          <p className="text-sm text-foreground/70">
            Turn a brief into articles, images and videos with Genfeed.
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
    </Card>
  );
}
