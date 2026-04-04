import {
  gsapPresets,
  useGsapEntrance,
  useGsapTimeline,
} from '@hooks/ui/use-gsap-entrance/use-gsap-entrance';
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('gsap', () => ({
  default: {
    context: vi.fn((fn, _ref) => {
      fn();
      return { revert: vi.fn() };
    }),
    fromTo: vi.fn(),
    registerPlugin: vi.fn(),
    timeline: vi.fn(() => ({ fromTo: vi.fn() })),
  },
}));

vi.mock('gsap/ScrollTrigger', () => ({
  ScrollTrigger: {},
}));

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
