'use client';

import type { GsapAnimation } from '@hooks/ui/use-gsap-entrance';
import { gsapPresets, useGsapEntrance } from '@hooks/ui/use-gsap-entrance';
import type { LayoutProps } from '@props/layout/layout.props';

/**
 * Sections opt into scroll reveals by marking elements with `data-reveal`.
 * Each marked element gets its own trigger, so a tall list reveals row by
 * row instead of all at once when its container enters the viewport.
 */
export const HOME_REVEAL_ANIMATIONS: GsapAnimation[] = [
  gsapPresets.revealEach('[data-reveal="up"]'),
  gsapPresets.scaleEach('[data-reveal="scale"]'),
];

export default function HomeReveal({
  children,
}: LayoutProps): React.ReactElement {
  const containerRef = useGsapEntrance({ animations: HOME_REVEAL_ANIMATIONS });

  return (
    <div data-testid="home-reveal" ref={containerRef}>
      {children}
    </div>
  );
}
