'use client';

import { useThemeLogo } from '@genfeedai/hooks/ui/use-theme-logo/use-theme-logo';
import type { AuthFormLayoutProps } from '@genfeedai/props/layout/auth-form-layout.props';
import { EnvironmentService } from '@genfeedai/services/core/environment.service';
import Image from 'next/image';

export default function AuthFormLayout({ children }: AuthFormLayoutProps) {
  const logoUrl = useThemeLogo();

  return (
    <div className="min-h-screen flex flex-col justify-center items-center">
      <div className="mb-4">
        {logoUrl && (
          <Image
            src={logoUrl}
            className="mx-auto mb-20 object-contain dark:invert"
            alt={EnvironmentService.LOGO_ALT}
            width={80}
            height={80}
            priority
          />
        )}
      </div>

      {children}
    </div>
  );
}
