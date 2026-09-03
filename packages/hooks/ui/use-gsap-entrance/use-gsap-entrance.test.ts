import {
  gsapPresets,
  prefersReducedMotion,
  useGsapEntrance,
  useGsapTimeline,
} from '@hooks/ui/use-gsap-entrance/use-gsap-entrance';
import { render, renderHook, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const gsapMock = {
  context: vi.fn((fn: (self?: unknown) => void, _ref?: unknown) => {
    fn();
    return { revert: vi.fn() };
  }),
  fromTo: vi.fn(),
  registerPlugin: vi.fn(),
  set: vi.fn(),
  timeline: vi.fn(() => ({ fromTo: vi.fn() })),
  to: vi.fn(),
};

const scrollTriggerMock = {
  batch: vi.fn(),
};

vi.mock('gsap', () => ({
  default: gsapMock,
}));

vi.mock('gsap/ScrollTrigger', () => ({
  ScrollTrigger: scrollTriggerMock,
}));

function stubReducedMotion(matches: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches })),
  );
}

function RevealList({
  animations,
}: {
  animations: Parameters<typeof useGsapEntrance>[0]['animations'];
}) {
  const ref = useGsapEntrance({ animations });
  return createElement(
    'div',
    { ref },
    createElement('p', { className: 'item' }, 'one'),
    createElement('p', { className: 'item' }, 'two'),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('useGsapEntrance', () => {
  it('returns a ref object', () => {
    const { result } = renderHook(() => useGsapEntrance({ animations: [] }));
    expect(result.current).toHaveProperty('current');
  });

  it('returns a ref when enabled=false', () => {
    const { result } = renderHook(() =>
      useGsapEntrance({ animations: [], enabled: false }),
    );
    expect(result.current).toHaveProperty('current');
  });

  it('returns a ref with animation config', () => {
    const { result } = renderHook(() =>
      useGsapEntrance({
        animations: [{ from: { opacity: 0, y: 30 }, selector: '.hero' }],
        enabled: true,
      }),
    );
    expect(result.current).toHaveProperty('current');
  });
});

describe('useGsapEntrance batch reveals', () => {
  it('hides every element up front and gives each its own scroll trigger', async () => {
    render(
      createElement(RevealList, {
        animations: [gsapPresets.revealEach('.item')],
      }),
    );

    await waitFor(() => expect(scrollTriggerMock.batch).toHaveBeenCalled());

    const [elements, vars] = scrollTriggerMock.batch.mock.calls[0];
    expect(elements).toHaveLength(2);
    expect(gsapMock.set).toHaveBeenCalledWith(elements, { opacity: 0, y: 32 });
    expect(vars).toMatchObject({ once: true, start: 'top 88%' });
    expect(gsapMock.fromTo).not.toHaveBeenCalled();

    vars.onEnter(Array.from(elements));
    expect(gsapMock.to).toHaveBeenCalledWith(
      Array.from(elements),
      expect.objectContaining({ opacity: 1, stagger: 0.12, y: 0 }),
    );
  });

  it('keeps shared-trigger animations on a single tween', async () => {
    render(
      createElement(RevealList, {
        animations: [gsapPresets.staggerCards('.item', '.item')],
      }),
    );

    await waitFor(() => expect(gsapMock.fromTo).toHaveBeenCalled());
    expect(scrollTriggerMock.batch).not.toHaveBeenCalled();
  });

  it('leaves content untouched when the reader prefers reduced motion', async () => {
    stubReducedMotion(true);

    render(
      createElement(RevealList, {
        animations: [gsapPresets.revealEach('.item')],
      }),
    );

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(gsapMock.context).not.toHaveBeenCalled();
    expect(gsapMock.set).not.toHaveBeenCalled();
  });
});

describe('prefersReducedMotion', () => {
  it('is false when matchMedia is unavailable', () => {
    expect(prefersReducedMotion()).toBe(false);
  });

  it('reads the reduced-motion media query', () => {
    stubReducedMotion(true);
    expect(prefersReducedMotion()).toBe(true);

    stubReducedMotion(false);
    expect(prefersReducedMotion()).toBe(false);
  });
});

describe('useGsapTimeline', () => {
  it('returns a ref object', () => {
    const { result } = renderHook(() => useGsapTimeline({ steps: [] }));
    expect(result.current).toHaveProperty('current');
  });

  it('returns a ref with steps', () => {
    const { result } = renderHook(() =>
      useGsapTimeline({
        steps: [{ from: { opacity: 0, y: 20 }, selector: '.step1' }],
      }),
    );
    expect(result.current).toHaveProperty('current');
  });
});

describe('gsapPresets', () => {
  it('revealEach and scaleEach batch per element', () => {
    expect(gsapPresets.revealEach('.row').scrollTrigger).toEqual({
      batch: true,
      start: 'top 88%',
    });
    expect(gsapPresets.scaleEach('.tile').from).toEqual({
      opacity: 0,
      scale: 0.94,
    });
  });

  it('fadeUp returns animation config with correct selector', () => {
    const anim = gsapPresets.fadeUp('.hero');
    expect(anim.selector).toBe('.hero');
    expect(anim.from.opacity).toBe(0);
    expect(anim.from.y).toBe(30);
  });

  it('staggerCards includes stagger and scrollTrigger', () => {
    const anim = gsapPresets.staggerCards('.card', '.grid');
    expect(anim.stagger).toBeGreaterThan(0);
    expect(anim.scrollTrigger?.trigger).toBe('.grid');
  });

  it('alternateSlide uses function for x', () => {
    const anim = gsapPresets.alternateSlide('.item', '.container');
    expect(typeof anim.from.x).toBe('function');
    if (typeof anim.from.x === 'function') {
      expect(anim.from.x(0)).toBe(-30);
      expect(anim.from.x(1)).toBe(30);
    }
  });

  it('scaleIn returns animation with scale property', () => {
    const anim = gsapPresets.scaleIn('.card');
    expect(anim.from.scale).toBe(0.95);
  });
});
