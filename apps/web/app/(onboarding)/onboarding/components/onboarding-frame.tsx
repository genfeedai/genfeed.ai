'use client';

import { useThemeLogo } from '@hooks/ui/use-theme-logo/use-theme-logo';
import { EnvironmentService } from '@services/core/environment.service';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

/**
 * The wizard's own frame: logo, wordmark, progress and the step. The loaded
 * wizard and the prerendered fallback share it, so the steps swap in without
 * the page moving (#10886).
 */
export default function OnboardingFrame({
  children,
  contentClassName = 'mt-12',
  footer,
  progress,
}: {
  children: ReactNode;
  contentClassName?: string;
  footer?: ReactNode;
  progress?: ReactNode;
}) {
  const translate = useTranslations('pages.onboarding.firstDrafts');
  const logoUrl = useThemeLogo();

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-6 py-8">
        <div className="flex items-center gap-3 mb-8">
          {logoUrl && (
            <Image
              src={logoUrl}
              alt={EnvironmentService.LOGO_ALT}
              className="size-8 object-contain dark:invert"
              width={32}
              height={32}
              sizes="32px"
              priority
            />
          )}
          <span className="text-foreground font-semibold text-lg tracking-tight">
            {translate('appName')}
          </span>
        </div>

        <div className="max-w-4xl mx-auto">
          {progress}

          <div className={contentClassName}>{children}</div>

          {footer}
        </div>
      </div>
    </div>
  );
}
