'use client';

import {
  type GsapAnimation,
  gsapPresets,
  useGsapEntrance,
} from '@hooks/ui/use-gsap-entrance';
import type { RefObject } from 'react';
import { useMemo } from 'react';

export interface UseMarketingEntranceOptions {
  /** Include fadeUp hero animation (default: true) */
  hero?: boolean;
  /** Include staggerCards animation (default: true) */
  cards?: boolean;
  /** Include fadeUp sections animation (default: true) */
  sections?: boolean;
  /** Additional animations appended after the defaults */
  extra?: GsapAnimation[];
  /** Whether to enable animations (forwarded to useGsapEntrance) */
  enabled?: boolean;
}

/**
 * Shared GSAP entrance animation preset for marketing pages.
 *
 * By default applies the standard three-animation recipe:
 *   1. fadeUp('.gsap-hero')
 *   2. staggerCards('.gsap-card', '.gsap-grid')
 *   3. fadeUp('.gsap-section', '.gsap-section')
 *
 * Toggle individual presets off or append extra animations as needed.
 *
 * @example
 * ```tsx
 * // Full default (hero + cards + sections)
 * const ref = useMarketingEntrance();
 *
 * // Hero + sections only (no cards)
 * const ref = useMarketingEntrance({ cards: false });
 *
 * // Hero only
 * const ref = useMarketingEntrance({ cards: false, sections: false });
 * ```
 */
export function useMarketingEntrance<T extends HTMLElement = HTMLDivElement>(
  options: UseMarketingEntranceOptions = {},
): RefObject<T | null> {
  const {
    hero = true,
    cards = true,
    sections = true,
    extra,
    enabled,
  } = options;

  const animations = useMemo(() => {
    const result: GsapAnimation[] = [];
    if (hero) result.push(gsapPresets.fadeUp('.gsap-hero'));
    if (cards)
      result.push(gsapPresets.staggerCards('.gsap-card', '.gsap-grid'));
    if (sections)
      result.push(gsapPresets.fadeUp('.gsap-section', '.gsap-section'));
    if (extra) result.push(...extra);
    return result;
  }, [hero, cards, sections, extra]);

  return useGsapEntrance<T>({ animations, enabled });
}
