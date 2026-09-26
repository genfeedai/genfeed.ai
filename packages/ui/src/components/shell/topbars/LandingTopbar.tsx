'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { Button } from '@ui/primitives/button';
import TopbarLogo from '@ui/topbars/logo/TopbarLogo';
import Link from 'next/link';

export interface LandingTopbarProps {
  ctaHref: string;
  ctaLabel: string;
  logoHref?: string;
  /** Optional second action, rendered before the primary CTA from `sm` up. */
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

        <div className="flex items-center gap-3">
          {secondaryCtaHref && secondaryCtaLabel ? (
            <Button
              variant={ButtonVariant.SECONDARY}
              size={ButtonSize.PUBLIC}
              asChild
              className="hidden h-10 px-5 text-sm sm:inline-flex"
            >
              <Link
                href={secondaryCtaHref}
                target="_blank"
                rel="noopener noreferrer"
              >
                {secondaryCtaLabel}
              </Link>
            </Button>
          ) : null}

          <Button
            size={ButtonSize.PUBLIC}
            asChild
            className="h-10 px-5 text-sm"
          >
            <Link href={ctaHref} target="_blank" rel="noopener noreferrer">
              {ctaLabel}
            </Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
