'use client';

import { type RefObject, useLayoutEffect, useRef } from 'react';

/** How long the bar takes to fold into its resting pill, and to open again. */
export const PROMPT_BAR_MORPH_MS = 240;
const PROMPT_BAR_MORPH_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)';

function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * Softens the switch between the full prompt bar and its resting pill. The
 * two layouts differ in structure, so the bar cannot tween between them; it
 * glides the shell's height from the old layout's height to the new one and
 * fades the new layout in. Attach the returned ref to the bar's shell element.
 * A user who prefers reduced motion gets the instant switch.
 */
export function usePromptBarMorph(
  isActive: boolean,
): RefObject<HTMLDivElement | null> {
  const shellRef = useRef<HTMLDivElement>(null);
  const lastHeightRef = useRef<number | null>(null);
  const wasActiveRef = useRef(isActive);
  const settleRef = useRef<(() => void) | null>(null);

  // No dependency list: the height is re-read after every commit so the value
  // the next switch starts from is the bar's height as the user last saw it.
  useLayoutEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;

    const previousHeight = lastHeightRef.current;
    const hasSwitched = wasActiveRef.current !== isActive;
    wasActiveRef.current = isActive;

    if (hasSwitched && previousHeight !== null && !prefersReducedMotion()) {
      settleRef.current?.();
      const nextHeight = shell.getBoundingClientRect().height;

      if (Math.abs(nextHeight - previousHeight) > 1) {
        let timeoutId: number | undefined;
        const settle = (): void => {
          window.clearTimeout(timeoutId);
          shell.removeEventListener('transitionend', handleTransitionEnd);
          shell.style.height = '';
          shell.style.transition = '';
          settleRef.current = null;
        };
        const handleTransitionEnd = (event: TransitionEvent): void => {
          if (event.target === shell && event.propertyName === 'height')
            settle();
        };

        shell.style.transition = 'none';
        shell.style.height = `${previousHeight}px`;
        // Commit the starting height before the transition is switched on.
        void shell.offsetHeight;
        shell.style.transition = `height ${PROMPT_BAR_MORPH_MS}ms ${PROMPT_BAR_MORPH_EASING}`;
        shell.style.height = `${nextHeight}px`;
        shell.addEventListener('transitionend', handleTransitionEnd);
        timeoutId = window.setTimeout(settle, PROMPT_BAR_MORPH_MS + 80);
        settleRef.current = settle;

        if (typeof shell.animate === 'function') {
          for (const child of Array.from(shell.children)) {
            child.animate([{ opacity: 0 }, { opacity: 1 }], {
              duration: PROMPT_BAR_MORPH_MS,
              easing: 'ease-out',
            });
          }
        }
      }
    }

    lastHeightRef.current = shell.getBoundingClientRect().height;
  });

  useLayoutEffect(() => () => settleRef.current?.(), []);

  return shellRef;
}
