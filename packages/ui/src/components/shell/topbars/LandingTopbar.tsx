'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { Button } from '@ui/primitives/button';
import TopbarLogo from '@ui/topbars/logo/TopbarLogo';
import Link from 'next/link';
import { type ReactNode, useEffect, useState } from 'react';

export interface LandingTopbarProps {
  ctaHref: string;
  ctaLabel: string;
  /**
   * CSS selector of an in-page CTA. While it is on screen the topbar CTA is
   * hidden at every breakpoint, because the hero button already owns the tap;
   * it appears once the page scrolls past it.
   */
  hideActionWhileVisible?: string;
  logoHref?: string;
  primaryAction?: ReactNode;
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
  hideActionWhileVisible,
  logoHref = '/',
  primaryAction,
  secondaryCtaHref,
  secondaryCtaLabel,
}: LandingTopbarProps): React.ReactElement {
  // Start hidden when a selector is given: the hero CTA is the first thing on
  // screen, so the server render matches and the bar does not flash a button.
  const [isInPageCtaVisible, setIsInPageCtaVisible] = useState(
    Boolean(hideActionWhileVisible),
  );

  useEffect(() => {
    if (!hideActionWhileVisible) return;
    if (typeof IntersectionObserver === 'undefined') {
      setIsInPageCtaVisible(false);
      return;
    }
    const target = document.querySelector(hideActionWhileVisible);
    if (!target) {
      setIsInPageCtaVisible(false);
      return;
    }
    const observer = new IntersectionObserver(([entry]) =>
      setIsInPageCtaVisible(entry.isIntersecting),
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [hideActionWhileVisible]);

  return (
    <header className="fixed inset-x-0 top-0 z-50 w-full border-b border-edge/10 bg-background/90 backdrop-blur-2xl">
      <div className="container mx-auto flex h-20 items-center justify-between px-6">
        <TopbarLogo logoHref={logoHref} />

        <div
          className={`flex items-center gap-2 transition-[opacity,visibility] duration-200 sm:gap-3 ${
            isInPageCtaVisible ? 'invisible opacity-0' : ''
          }`}
        >
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

          {primaryAction ?? (
            <Button
              size={ButtonSize.PUBLIC}
              asChild
              className="h-11 px-2 text-xs tracking-[0.04em] sm:px-5 sm:text-sm sm:tracking-[0.18em]"
            >
              <Link
                href={ctaHref}
                target={ctaHref.startsWith('/') ? undefined : '_blank'}
                rel={
                  ctaHref.startsWith('/') ? undefined : 'noopener noreferrer'
                }
              >
                {ctaLabel}
              </Link>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
