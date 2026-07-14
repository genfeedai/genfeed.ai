'use client';

import { useThemeLogo } from '@genfeedai/hooks/ui/use-theme-logo/use-theme-logo';
import type { AuthFormLayoutProps } from '@genfeedai/props/layout/auth-form-layout.props';
import { EnvironmentService } from '@genfeedai/services/core/environment.service';
import Image from 'next/image';

const LOGO_DIMENSIONS = {
  compact: 48,
  default: 80,
} as const;

export default function AuthFormLayout({
  children,
  logoSize = 'default',
}: AuthFormLayoutProps) {
  const logoUrl = useThemeLogo();
  const logoDimension = LOGO_DIMENSIONS[logoSize];

  // Compact = the auth forms (login / sign-up / forgot / reset). These sit in a
  // single elevated card. The `default` size is reserved for wide, non-form
  // surfaces (oauth/cli, managed-credits success) that must not be boxed.
  if (logoSize === 'compact') {
    return (
      <div className="min-h-screen flex flex-col justify-center items-center bg-background px-4 text-foreground">
        <div className="w-full max-w-[400px] rounded-2xl bg-card p-8 shadow-border">
          {logoUrl && (
            <Image
              src={logoUrl}
              className="mb-8 object-contain dark:invert"
              alt={EnvironmentService.LOGO_ALT}
              width={logoDimension}
              height={logoDimension}
              priority
            />
          )}

          {children}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col justify-center items-center">
      <div className="mb-4">
        {logoUrl && (
          <Image
            src={logoUrl}
            className="mx-auto mb-20 object-contain dark:invert"
            alt={EnvironmentService.LOGO_ALT}
            width={logoDimension}
            height={logoDimension}
            priority
          />
        )}
      </div>

      {children}
    </div>
  );
}
