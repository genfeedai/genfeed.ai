'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { EnvironmentService } from '@services/core/environment.service';
import { Button } from '@ui/primitives/button';
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

  return (
    <Button
      asChild
      variant={variant}
      size={ButtonSize.PUBLIC}
      className={className}
    >
      <a href={href} target="_blank" rel="noopener noreferrer">
        {displayLabel}
        <LuArrowRight className="h-4 w-4" />
      </a>
    </Button>
  );
}
