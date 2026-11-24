import { getAppSignUpUrl } from '@data/app-links';
import { ButtonVariant } from '@genfeedai/contracts';
import { normalizeSignupReferralCode } from '@genfeedai/helpers';
import ButtonTracked from '@web-components/buttons/tracked/ButtonTracked';
import { ArrowRight } from 'lucide-react';

interface ProfileSignupCtaProps {
  handle: string;
  /** Replaces the default wording, for a spot too narrow for the referral line. */
  label?: string;
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
 * Sign-up from a creator's page, a secondary action under the creator's own
 * content. With the owner's referral code the button says so and the link
 * carries it; without one it is a plain sign-up.
 */
export default function ProfileSignupCta({
  handle,
  label: labelOverride,
  referralCode,
}: ProfileSignupCtaProps) {
  const isReferral = Boolean(normalizeSignupReferralCode(referralCode));
  const label =
    labelOverride ??
    (isReferral
      ? `Join Genfeed with @${handle}'s referral`
      : 'Sign up to Genfeed');

  return (
    <ButtonTracked
      asChild
      variant={ButtonVariant.SECONDARY}
      className="min-w-0 max-w-full overflow-hidden"
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
        <span className="min-w-0 truncate">{label}</span>
        <ArrowRight aria-hidden="true" className="size-4" />
      </a>
    </ButtonTracked>
  );
}
