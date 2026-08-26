'use client';

import { useThemeLogo } from '@genfeedai/hooks/ui/use-theme-logo/use-theme-logo';
import type { AuthFormLayoutProps } from '@genfeedai/props/layout/auth-form-layout.props';
import { EnvironmentService } from '@genfeedai/services/core/environment.service';
import Card from '@ui/card/Card';
import Image from 'next/image';

const LOGO_DIMENSIONS = {
  compact: 56,
  default: 80,
} as const;

export default function AuthFormLayout({
  children,
  description,
  logoSize = 'default',
  title,
}: AuthFormLayoutProps) {
  const logoUrl = useThemeLogo();
  const logoDimension = LOGO_DIMENSIONS[logoSize];

  // Compact = the auth forms (login / sign-up / forgot / reset). These sit in a
  // single elevated card. The `default` size is reserved for wide, non-form
  // surfaces (oauth/cli, managed-credits success) that must not be boxed.
  if (logoSize === 'compact') {
    return (
      <main className="min-h-screen flex flex-col justify-center items-center bg-background px-4 text-foreground">
        <Card className="w-full max-w-md" bodyClassName="gap-0 p-6 sm:p-10">
          {title ? (
            <div className="mb-8 flex items-center gap-5">
              {logoUrl && (
                <Image
                  src={logoUrl}
                  className="shrink-0 object-contain dark:invert"
                  alt={EnvironmentService.LOGO_ALT}
                  width={logoDimension}
                  height={logoDimension}
                  priority
                />
              )}
              <div className="min-w-0">
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                  {title}
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  {description}
                </p>
              </div>
            </div>
          ) : (
            logoUrl && (
              <Image
                src={logoUrl}
                className="mb-8 object-contain dark:invert"
                alt={EnvironmentService.LOGO_ALT}
                width={logoDimension}
                height={logoDimension}
                priority
              />
            )
          )}

          {children}
        </Card>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex flex-col justify-center items-center">
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
    </main>
  );
}
