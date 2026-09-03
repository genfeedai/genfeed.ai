'use client';

import type { RefObject } from 'react';
import { useEffect, useRef } from 'react';

export interface GsapAnimation {
  /** CSS selector for elements to animate */
  selector: string;
  /** Animation properties */
  from: {
    opacity?: number;
    y?: number;
    x?: number | ((i: number) => number);
    scale?: number;
  };
  /** Duration in seconds */
  duration?: number;
  /** Stagger delay between elements */
  stagger?: number;
  /** Easing function */
  ease?: string;
  /** ScrollTrigger options - if omitted, animation plays immediately */
  scrollTrigger?: {
    trigger?: string;
    start?: string;
    /**
     * Give every matched element its own trigger instead of one shared trigger.
     * Elements entering the viewport together stagger as a group, so long lists
     * reveal row by row as the reader scrolls.
     */
    batch?: boolean;
  };
}

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

export function prefersReducedMotion(): boolean {
  if (
    typeof window === 'undefined' ||
    typeof window.matchMedia !== 'function'
  ) {
    return false;
  }

  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

/**
 * Content the reader can already see is never hidden for a reveal. The GSAP
 * import resolves after first paint, so hiding it would flash on anchor
 * entry or a restored scroll position.
 */
function isInViewport(element: Element): boolean {
  const { bottom, top } = element.getBoundingClientRect();
  return bottom > 0 && top < window.innerHeight;
}

export interface UseGsapEntranceOptions {
  /** Array of animations to run */
  animations: GsapAnimation[];
  /** Whether to enable animations */
  enabled?: boolean;
}

/**
 * Centralized hook for GSAP entrance animations.
 * Handles dynamic import, ScrollTrigger registration, and cleanup.
 *
 * @example
 * ```tsx
 * const ref = useGsapEntrance({
 *   animations: [
 *     { selector: '.hero', from: { opacity: 0, y: 30 }, duration: 1 },
 *     {
 *       selector: '.card',
 *       from: { opacity: 0, y: 40 },
 *       stagger: 0.1,
 *       scrollTrigger: { trigger: '.cards-grid', start: 'top 85%' }
 *     },
 *   ],
 * });
 * return <div ref={ref}>...</div>;
 * ```
 */
export function useGsapEntrance<T extends HTMLElement = HTMLDivElement>(
  options: UseGsapEntranceOptions,
): RefObject<T | null> {
  const { animations, enabled = true } = options;
  const containerRef = useRef<T | null>(null);

  useEffect(() => {
    if (
      !enabled ||
      typeof window === 'undefined' ||
      animations.length === 0 ||
      prefersReducedMotion()
    ) {
      return;
    }

    let ctx: { revert: () => void } | null = null;
    let isCancelled = false;

    const initGsap = async () => {
      try {
        const [gsapModule, scrollTriggerModule] = await Promise.all([
          import('gsap'),
          import('gsap/ScrollTrigger'),
        ]);
        if (isCancelled) return;

        const gsap = gsapModule.default;
        const { ScrollTrigger } = scrollTriggerModule;

        gsap.registerPlugin(ScrollTrigger);

        ctx = gsap.context(() => {
          for (const anim of animations) {
            const elements = containerRef.current?.querySelectorAll(
              anim.selector,
            );
            if (!elements || elements.length === 0) continue;

            const fromVars: Record<string, unknown> = { ...anim.from };
            const toVars: Record<string, unknown> = {
              duration: anim.duration ?? 0.8,
              ease: anim.ease ?? 'power4.out',
              opacity: 1,
              scale: 1,
              x: 0,
              y: 0,
            };

            if (anim.stagger) {
              toVars.stagger = anim.stagger;
            }

            const start = anim.scrollTrigger?.start ?? 'top 85%';

            if (anim.scrollTrigger?.batch) {
              const pending = Array.from(elements).filter(
                (element) => !isInViewport(element),
              );
              if (pending.length === 0) continue;

              gsap.set(pending, fromVars);
              ScrollTrigger.batch(pending, {
                onEnter: (batch) => {
                  gsap.to(batch, toVars);
                },
                once: true,
                start,
              });
              continue;
            }

            if (anim.scrollTrigger) {
              toVars.scrollTrigger = {
                start,
                trigger: anim.scrollTrigger.trigger ?? anim.selector,
              };
            }

            gsap.fromTo(anim.selector, fromVars, toVars);
          }
        }, containerRef);
      } catch {
        // GSAP not available, fail silently
      }
    };

    initGsap();

    return () => {
      isCancelled = true;
      ctx?.revert();
    };
  }, [animations, enabled]);

  return containerRef;
}

export interface GsapTimelineStep {
  selector: string;
  from: {
    opacity?: number;
    y?: number;
    x?: number;
    scale?: number;
  };
  duration?: number;
  stagger?: number;
  offset?: string; // e.g., '-=0.4'
}

export interface UseGsapTimelineOptions {
  steps: GsapTimelineStep[];
  enabled?: boolean;
}

/**
 * Hook for GSAP timeline animations (sequential with overlapping).
 * Perfect for hero sections where elements animate in sequence.
 */
export function useGsapTimeline<T extends HTMLElement = HTMLDivElement>(
  options: UseGsapTimelineOptions,
): RefObject<T | null> {
  const { steps, enabled = true } = options;
  const containerRef = useRef<T | null>(null);

  useEffect(() => {
    if (
      !enabled ||
      typeof window === 'undefined' ||
      steps.length === 0 ||
      prefersReducedMotion()
    ) {
      return;
    }

    let ctx: { revert: () => void } | null = null;
    let isCancelled = false;

    const initGsap = async () => {
      try {
        const gsapModule = await import('gsap');
        if (isCancelled) return;

        const gsap = gsapModule.default;

        ctx = gsap.context(() => {
          const tl = gsap.timeline();

          for (const step of steps) {
            const elements = containerRef.current?.querySelectorAll(
              step.selector,
            );
            if (!elements || elements.length === 0) continue;

            const fromVars: Record<string, unknown> = { ...step.from };
            const toVars: Record<string, unknown> = {
              duration: step.duration ?? 0.8,
              ease: 'power4.out',
              opacity: 1,
              x: 0,
              y: 0,
            };

            if (step.stagger) {
              toVars.stagger = step.stagger;
            }

            tl.fromTo(step.selector, fromVars, toVars, step.offset);
          }
        }, containerRef);
      } catch {
        // GSAP not available
      }
    };

    initGsap();

    return () => {
      isCancelled = true;
      ctx?.revert();
    };
  }, [steps, enabled]);

  return containerRef;
}

/**
 * Preset animation configurations for common patterns
 */
export const gsapPresets = {
  /** Alternating left/right entrance */
  alternateSlide: (selector: string, trigger: string): GsapAnimation => ({
    duration: 0.8,
    from: { opacity: 0, x: (i: number) => (i % 2 === 0 ? -30 : 30) },
    scrollTrigger: { start: 'top 80%', trigger },
    selector,
    stagger: 0.2,
  }),
  /** Fade in from bottom */
  fadeUp: (selector: string, scrollTrigger?: string): GsapAnimation => ({
    duration: 1,
    from: { opacity: 0, y: 30 },
    scrollTrigger: scrollTrigger ? { trigger: scrollTrigger } : undefined,
    selector,
  }),

  /** Scale in effect */
  scaleIn: (selector: string, scrollTrigger?: string): GsapAnimation => ({
    duration: 1,
    from: { opacity: 0, scale: 0.95 },
    scrollTrigger: scrollTrigger ? { trigger: scrollTrigger } : undefined,
    selector,
  }),

  /** Each element fades up on its own trigger; rows entering together stagger */
  revealEach: (selector: string): GsapAnimation => ({
    duration: 0.9,
    from: { opacity: 0, y: 32 },
    scrollTrigger: { batch: true, start: 'top 88%' },
    selector,
    stagger: 0.12,
  }),

  /** Each element scales in on its own trigger; rows entering together stagger */
  scaleEach: (selector: string): GsapAnimation => ({
    duration: 0.8,
    from: { opacity: 0, scale: 0.94 },
    scrollTrigger: { batch: true, start: 'top 88%' },
    selector,
    stagger: 0.08,
  }),

  /** Staggered cards entrance */
  staggerCards: (selector: string, trigger: string): GsapAnimation => ({
    duration: 0.6,
    from: { opacity: 0, y: 40 },
    scrollTrigger: { start: 'top 85%', trigger },
    selector,
    stagger: 0.1,
  }),
};
