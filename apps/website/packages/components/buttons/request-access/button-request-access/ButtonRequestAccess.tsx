'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { EnvironmentService } from '@services/core/environment.service';
import ButtonTracked from '@ui/buttons/tracked/ButtonTracked';
import { LuArrowRight } from 'react-icons/lu';

interface ButtonRequestAccessProps {
  label?: string;
  variant?: ButtonVariant;
  className?: string;
}

export default function ButtonRequestAccess({
  label,
  variant = ButtonVariant.DEFAULT,
  className,
}: ButtonRequestAccessProps) {
  const isPreLaunch = EnvironmentService.isPreLaunch;
  const displayLabel = label ?? (isPreLaunch ? 'Book a Call' : 'Get Started');
  const href = isPreLaunch
    ? EnvironmentService.calendly
    : `${EnvironmentService.apps.app}/sign-up`;
  const trackingAction = isPreLaunch
    ? 'book_call_request_access'
    : 'start_signup_request_access';

  return (
    <ButtonTracked
      asChild
      variant={variant}
      size={ButtonSize.PUBLIC}
      className={className}
      trackingName="request_access_click"
      trackingData={{
        action: trackingAction,
        label: displayLabel,
      }}
    >
      <a href={href} target="_blank" rel="noopener noreferrer">
        {displayLabel}
        <LuArrowRight className="size-4" />
      </a>
    </ButtonTracked>
  );
}
