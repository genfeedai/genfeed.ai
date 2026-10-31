'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

/** Marks the in-page call to action that owns the tap while it is on screen. */
export const HERO_CTA_SELECTOR = '[data-hero-cta]';

/** The fixed bar covers the top of the viewport; a CTA under it is not on screen. */
const TOPBAR_HEIGHT_PX = 80;

/**
 * Whether the bar's own call to action may show.
 *
 * Starts `false` and only flips once a hero CTA has been seen leaving the
 * screen. A bar that decides after hydration would paint the button first and
 * pull it back, so the hidden state for a page that has a hero CTA lives in
 * CSS (`HERO_CTA_PENDING_CLASS`), which is correct in the server-rendered
 * markup. Pages without a hero CTA never match it and keep the button.
 */
export function useHeroCtaRevealed(): boolean {
  const pathname = usePathname();
  const [isRevealed, setIsRevealed] = useState(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: the bar lives in a layout, so a client navigation has to look for the next page's hero CTA.
  useEffect(() => {
    setIsRevealed(false);

    const targets = Array.from(
      document.querySelectorAll<HTMLElement>(HERO_CTA_SELECTOR),
    );
    if (targets.length === 0 || typeof IntersectionObserver === 'undefined') {
      setIsRevealed(true);
      return;
    }

    const visibleTargets = new Set<Element>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            visibleTargets.add(entry.target);
          } else {
            visibleTargets.delete(entry.target);
          }
        }
        setIsRevealed(visibleTargets.size === 0);
      },
      { rootMargin: `-${TOPBAR_HEIGHT_PX}px 0px 0px 0px` },
    );
    for (const target of targets) {
      observer.observe(target);
    }

    return () => observer.disconnect();
  }, [pathname]);

  return isRevealed;
}

/**
 * Hides the bar's action while the page has a hero CTA that is not yet
 * confirmed off screen. Space stays reserved, so nothing around it shifts.
 */
export const HERO_CTA_PENDING_CLASS =
  '[body:has([data-hero-cta])_&]:pointer-events-none [body:has([data-hero-cta])_&]:invisible [body:has([data-hero-cta])_&]:opacity-0';
