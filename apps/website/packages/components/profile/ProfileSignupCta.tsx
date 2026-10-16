import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { normalizeSignupReferralCode } from '@genfeedai/helpers';
import { EnvironmentService } from '@services/core/environment.service';
import ButtonTracked from '@ui/buttons/tracked/ButtonTracked';
import { ArrowRight } from 'lucide-react';

interface ProfileSignupCtaProps {
  handle: string;
  referralCode?: string | null;
}

export function getProfileSignupHref(referralCode?: string | null): string {
  const signUpUrl = new URL(`${EnvironmentService.apps.app}/sign-up`);
  const code = normalizeSignupReferralCode(referralCode);

  if (code) {
    signUpUrl.searchParams.set('ref', code);
  }

  return signUpUrl.toString();
}

export default function ProfileSignupCta({
  handle,
  referralCode,
}: ProfileSignupCtaProps) {
  return (
    <ButtonTracked
      asChild
      variant={ButtonVariant.DEFAULT}
      size={ButtonSize.PUBLIC}
      className="w-full"
      trackingName="signup_cta_click"
      trackingData={{
        action: 'profile_signup_cta',
        hasReferralCode: Boolean(normalizeSignupReferralCode(referralCode)),
        label: 'Sign up to Genfeed',
        profile: handle,
      }}
    >
      <a
        href={getProfileSignupHref(referralCode)}
        target="_blank"
        rel="noopener noreferrer"
      >
        Sign up to Genfeed
        <ArrowRight className="size-4" />
      </a>
    </ButtonTracked>
  );
}
