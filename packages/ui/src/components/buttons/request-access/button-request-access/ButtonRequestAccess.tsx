'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { EnvironmentService } from '@genfeedai/services/core/environment.service';
import { Button } from '@ui/primitives/button';
import Link from 'next/link';

export default function ButtonRequestAccess({
  label = 'Join Mailing List',
  className,
  variant = ButtonVariant.DEFAULT,
}: {
  label?: string;
  className?: string;
  variant?: Exclude<ButtonVariant, ButtonVariant.UNSTYLED>;
}) {
  return (
    <Button
      asChild
      variant={variant}
      size={ButtonSize.PUBLIC}
      className={className}
    >
      <Link href={`${EnvironmentService.apps.app}/request-access`}>
        {label}
      </Link>
    </Button>
  );
}
