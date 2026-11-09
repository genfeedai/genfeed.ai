import { getAppSignUpUrl } from '@data/app-links';
import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { normalizeSignupReferralCode } from '@genfeedai/helpers';
import ButtonTracked from '@web-components/buttons/tracked/ButtonTracked';
import { ArrowRight } from 'lucide-react';

interface ProfileSignupCtaProps {
  handle: string;
  referralCode?: string | null;
}

export function getProfileSignupHref(referralCode?: string | null): string {
  const signUpUrl = new URL(getAppSignUpUrl());
  const code = normalizeSignupReferralCode(referralCode);

  if (code) {
    signUpUrl.searchParams.set('ref', code);
  }

  return signUpUrl.toString();
}

/**
 * Sign-up from a creator's profile. With the owner's referral code the button
 * says so and the link carries it; without one it is a plain sign-up.
 */
export default function ProfileSignupCta({
  handle,
  referralCode,
}: ProfileSignupCtaProps) {
  const isReferral = Boolean(normalizeSignupReferralCode(referralCode));
  const label = isReferral
    ? `Join Genfeed with @${handle}'s referral`
    : 'Sign up to Genfeed';

  return (
    <ButtonTracked
      asChild
      variant={ButtonVariant.DEFAULT}
      size={ButtonSize.PUBLIC}
      className="w-full"
      // The default wrapper is an inline-flex box that shrink-wraps the
      // button, so `w-full` resolved against it and the CTA sat left of the
      // profile column instead of spanning it.
      withWrapper={false}
      trackingName="signup_cta_click"
      trackingData={{
        action: 'profile_signup_cta',
        hasReferralCode: isReferral,
        label,
        profile: handle,
      }}
    >
      <a
        href={getProfileSignupHref(referralCode)}
        target="_blank"
        rel="noopener noreferrer"
      >
        {label}
        <ArrowRight aria-hidden="true" className="size-4" />
      </a>
    </ButtonTracked>
  );
}
