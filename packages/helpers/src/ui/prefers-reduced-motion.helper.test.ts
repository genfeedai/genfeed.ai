import { afterEach, describe, expect, it, vi } from 'vitest';
import { prefersReducedMotion } from './prefers-reduced-motion.helper';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('prefersReducedMotion', () => {
  it('is false when matchMedia is unavailable', () => {
    vi.stubGlobal('matchMedia', undefined);
    expect(prefersReducedMotion()).toBe(false);
  });

  it('reads the reduced-motion media query', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: true })),
    );
    expect(prefersReducedMotion()).toBe(true);

    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: false })),
    );
    expect(prefersReducedMotion()).toBe(false);
  });
});
