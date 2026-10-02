'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { Button } from '@ui/primitives/button';
import TopbarLogo from '@ui/topbars/logo/TopbarLogo';
import Link from 'next/link';

export interface LandingTopbarProps {
  ctaHref: string;
  ctaLabel: string;
  logoHref?: string;
  /**
   * Optional second action, opened in the same tab and rendered before the
   * primary CTA from 360px up:
   * most paid traffic lands on a phone, and hiding the sales path below `sm`
   * left those visitors a single choice. Only a 320px screen is too narrow
   * for both buttons, and the primary one wins there.
   */
  secondaryCtaHref?: string;
  secondaryCtaLabel?: string;
}

export default function LandingTopbar({
  ctaHref,
  ctaLabel,
  logoHref = '/',
  secondaryCtaHref,
  secondaryCtaLabel,
}: LandingTopbarProps): React.ReactElement {
  return (
    <header className="fixed inset-x-0 top-0 z-50 w-full border-b border-edge/10 bg-background/90 backdrop-blur-2xl">
      <div className="container mx-auto flex h-20 items-center justify-between px-6">
        <TopbarLogo logoHref={logoHref} />

        <div className="flex items-center gap-2 sm:gap-3">
          {secondaryCtaHref && secondaryCtaLabel ? (
            <Button
              variant={ButtonVariant.SECONDARY}
              size={ButtonSize.PUBLIC}
              asChild
              className="h-11 px-2 text-xs tracking-[0.04em] max-[359px]:hidden sm:px-5 sm:text-sm sm:tracking-[0.18em]"
            >
              <Link href={secondaryCtaHref}>{secondaryCtaLabel}</Link>
            </Button>
          ) : null}

          <Button
            size={ButtonSize.PUBLIC}
            asChild
            className="h-11 px-2 text-xs tracking-[0.04em] sm:px-5 sm:text-sm sm:tracking-[0.18em]"
          >
            <Link
              href={ctaHref}
              target={ctaHref.startsWith('/') ? undefined : '_blank'}
              rel={ctaHref.startsWith('/') ? undefined : 'noopener noreferrer'}
            >
              {ctaLabel}
            </Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
