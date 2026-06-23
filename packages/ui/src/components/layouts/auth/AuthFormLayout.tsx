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

  return (
    <div
      className={`min-h-screen flex flex-col justify-center items-center ${
        logoSize === 'compact' ? 'bg-background px-4 text-foreground' : ''
      }`}
    >
      <div className="mb-4">
        {logoUrl && (
          <Image
            src={logoUrl}
            className={`mx-auto object-contain dark:invert ${
              logoSize === 'compact' ? 'mb-8' : 'mb-20'
            }`}
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
