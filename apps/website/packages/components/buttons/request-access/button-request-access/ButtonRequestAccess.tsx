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
  label = 'Get Started',
  variant = ButtonVariant.DEFAULT,
  className,
}: ButtonRequestAccessProps) {
  return (
    <Button
      asChild
      variant={variant}
      size={ButtonSize.PUBLIC}
      className={className}
    >
      <a
        href={`${EnvironmentService.apps.app}/sign-up`}
        target="_blank"
        rel="noopener noreferrer"
      >
        {label}
        <LuArrowRight className="h-4 w-4" />
      </a>
    </Button>
  );
}
