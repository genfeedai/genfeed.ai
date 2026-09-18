'use client';

import { logger } from '@services/core/logger.service';
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

type GsapContextHandle = {
  revert: () => void;
};

function isMountedHost(node: EventTarget | null | undefined): node is Element {
  return node instanceof Element && node.isConnected;
}

function queryMountedElements(container: Element, selector: string): Element[] {
  return Array.from(container.querySelectorAll(selector)).filter(
    (element) => element.isConnected && container.contains(element),
  );
}

function isDomInsertionRace(error: unknown): boolean {
  if (typeof DOMException !== 'undefined' && error instanceof DOMException) {
    if (error.name === 'NotFoundError') {
      return true;
    }
  }

  if (!(error instanceof Error)) {
    return false;
  }

  return (
    error.name === 'NotFoundError' ||
    /insertBefore/.test(error.message) ||
    /not a child of this node/i.test(error.message)
  );
}

function runMountedInsertion(run: () => void): boolean {
  try {
    run();
    return true;
  } catch (error) {
    if (isDomInsertionRace(error)) {
      return false;
    }

    throw error;
  }
}

function revertGsapContext(ctx: GsapContextHandle | null): void {
  if (!ctx) {
    return;
  }

  try {
    ctx.revert();
  } catch (error) {
    if (!isDomInsertionRace(error)) {
      logger.error('Failed to revert GSAP context', error);
    }
  }
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

    let ctx: GsapContextHandle | null = null;
    let isCancelled = false;

    const initGsap = async () => {
      let gsap: typeof import('gsap').default;
      let ScrollTrigger: typeof import('gsap/ScrollTrigger').ScrollTrigger;

      try {
        const [gsapModule, scrollTriggerModule] = await Promise.all([
          import('gsap'),
          import('gsap/ScrollTrigger'),
        ]);
        gsap = gsapModule.default;
        ScrollTrigger = scrollTriggerModule.ScrollTrigger;
      } catch {
        return;
      }

      const container = containerRef.current;
      if (isCancelled || !isMountedHost(container)) {
        return;
      }

      gsap.registerPlugin(ScrollTrigger);

      try {
        ctx = gsap.context(() => {
          for (const anim of animations) {
            if (!isMountedHost(container)) {
              return;
            }

            const elements = queryMountedElements(container, anim.selector);
            if (elements.length === 0) continue;

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
              const pending = elements.filter(
                (element) =>
                  element.isConnected &&
                  container.contains(element) &&
                  !isInViewport(element),
              );
              if (pending.length === 0) continue;

              if (
                !runMountedInsertion(() => {
                  gsap.set(pending, fromVars);
                  ScrollTrigger.batch(pending, {
                    onEnter: (batch) => {
                      const mountedBatch = Array.from(batch).filter(
                        (element) =>
                          element.isConnected && container.contains(element),
                      );
                      if (mountedBatch.length === 0) {
                        return;
                      }
                      runMountedInsertion(() => {
                        gsap.to(mountedBatch, toVars);
                      });
                    },
                    once: true,
                    start,
                  });
                })
              ) {
                continue;
              }
              continue;
            }

            if (anim.scrollTrigger) {
              // Resolve the trigger here rather than handing ScrollTrigger a
              // selector it may not find. An unresolvable trigger parks the
              // tween on its `from` state — `opacity: 0` — so one missing
              // marker class hides a whole section of a live page and says
              // nothing but a console warning. Falling back to the first
              // animated element keeps the reveal tied to the content.
              const triggerSelector =
                anim.scrollTrigger.trigger ?? anim.selector;
              const trigger =
                queryMountedElements(container, triggerSelector)[0] ??
                elements[0];
              if (!isMountedHost(trigger) || !container.contains(trigger)) {
                continue;
              }
              toVars.scrollTrigger = {
                start,
                trigger,
              };
            }

            runMountedInsertion(() => {
              gsap.fromTo(elements, fromVars, toVars);
            });
          }
        }, container);
      } catch (error) {
        if (isDomInsertionRace(error)) {
          return;
        }

        logger.error('Failed to start GSAP entrance animation', error);
      }
    };

    void initGsap();

    return () => {
      isCancelled = true;
      revertGsapContext(ctx);
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

    let ctx: GsapContextHandle | null = null;
    let isCancelled = false;

    const initGsap = async () => {
      let gsap: typeof import('gsap').default;

      try {
        const gsapModule = await import('gsap');
        gsap = gsapModule.default;
      } catch {
        return;
      }

      const container = containerRef.current;
      if (isCancelled || !isMountedHost(container)) {
        return;
      }

      try {
        ctx = gsap.context(() => {
          const tl = gsap.timeline();

          for (const step of steps) {
            if (!isMountedHost(container)) {
              return;
            }

            const elements = queryMountedElements(container, step.selector);
            if (elements.length === 0) continue;

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

            runMountedInsertion(() => {
              tl.fromTo(elements, fromVars, toVars, step.offset);
            });
          }
        }, container);
      } catch (error) {
        if (isDomInsertionRace(error)) {
          return;
        }

        logger.error('Failed to start GSAP timeline animation', error);
      }
    };

    void initGsap();

    return () => {
      isCancelled = true;
      revertGsapContext(ctx);
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
