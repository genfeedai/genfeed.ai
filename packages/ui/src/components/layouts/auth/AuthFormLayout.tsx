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
  aside,
  children,
  description,
  headingIcon,
  isWide = false,
  logoSize = 'default',
  title,
}: AuthFormLayoutProps) {
  const logoUrl = useThemeLogo();
  const logoDimension = LOGO_DIMENSIONS[logoSize];

  // Compact = the auth forms (login / sign-up / forgot / reset). These sit in a
  // single elevated card. The `default` size is reserved for wide, non-form
  // surfaces (oauth/cli, managed-credits success) that must not be boxed.
  if (logoSize === 'compact') {
    const heading = title ? (
      <div className="mb-8">
        <div className={`flex items-center ${headingIcon ? 'gap-4' : 'gap-5'}`}>
          {headingIcon ??
            (logoUrl && (
              <Image
                src={logoUrl}
                className="shrink-0 object-contain dark:invert"
                alt={EnvironmentService.LOGO_ALT}
                width={logoDimension}
                height={logoDimension}
                priority
              />
            ))}
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              {title}
            </h1>
            {headingIcon ? null : (
              <p className="mt-1 text-sm text-muted-foreground">
                {description}
              </p>
            )}
          </div>
        </div>

        {/* With a heading icon the description runs full width under the
            heading row, so it lines up with the card edge and actions. */}
        {headingIcon ? (
          <div className="mt-4 space-y-2 text-sm text-muted-foreground">
            {description}
          </div>
        ) : null}
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
    );

    // With an aside the form drops its card and sits on the page beside the
    // showcase. The aside is decorative and only shown from `lg` up, so phones
    // and tablets keep the single-column form.
    if (aside) {
      return (
        <main
          className="grid min-h-screen bg-background text-foreground lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]"
          data-desktop-drag="true"
        >
          <div className="flex flex-col items-center justify-center px-6 py-10 sm:px-10">
            <div className="w-full max-w-md">
              {heading}
              {children}
            </div>
          </div>
          <aside aria-hidden="true" className="hidden p-3 lg:block">
            {aside}
          </aside>
        </main>
      );
    }

    return (
      <main
        className="min-h-screen flex flex-col justify-center items-center bg-background px-4 text-foreground"
        data-desktop-drag="true"
      >
        <Card
          className={isWide ? 'w-full max-w-3xl' : 'w-full max-w-md'}
          bodyClassName="gap-0 p-6 sm:p-10"
        >
          {heading}
          {children}
        </Card>
      </main>
    );
  }

  return (
    <main
      className="min-h-screen flex flex-col justify-center items-center"
      data-desktop-drag="true"
    >
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
