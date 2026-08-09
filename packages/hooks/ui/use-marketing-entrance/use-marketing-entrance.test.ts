import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface MockAnimation {
  target: string;
  trigger?: string;
  type: string;
}

const mockUseGsapEntrance = vi.fn();

vi.mock('@hooks/ui/use-gsap-entrance', () => ({
  gsapPresets: {
    fadeUp: (target: string, trigger?: string): MockAnimation => ({
      target,
      trigger,
      type: 'fadeUp',
    }),
    staggerCards: (target: string, trigger?: string): MockAnimation => ({
      target,
      trigger,
      type: 'staggerCards',
    }),
  },
  useGsapEntrance: (options: unknown) => mockUseGsapEntrance(options),
}));

import { useMarketingEntrance } from './use-marketing-entrance';

describe('useMarketingEntrance', () => {
  const ref = { current: null };

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseGsapEntrance.mockReturnValue(ref);
  });

  it('applies the default three-animation recipe', () => {
    const { result } = renderHook(() => useMarketingEntrance());

    expect(result.current).toBe(ref);
    const options = mockUseGsapEntrance.mock.calls[0][0] as {
      animations: MockAnimation[];
      enabled?: boolean;
    };
    expect(options.animations).toEqual([
      { target: '.gsap-hero', trigger: undefined, type: 'fadeUp' },
      { target: '.gsap-card', trigger: '.gsap-grid', type: 'staggerCards' },
      { target: '.gsap-section', trigger: '.gsap-section', type: 'fadeUp' },
    ]);
    expect(options.enabled).toBeUndefined();
  });

  it('omits toggled-off presets', () => {
    renderHook(() => useMarketingEntrance({ cards: false, sections: false }));

    const options = mockUseGsapEntrance.mock.calls[0][0] as {
      animations: MockAnimation[];
    };
    expect(options.animations).toEqual([
      { target: '.gsap-hero', trigger: undefined, type: 'fadeUp' },
    ]);
  });

  it('appends extra animations and forwards enabled', () => {
    const extraAnimation = {
      target: '.custom',
      type: 'fadeUp',
    } as unknown as MockAnimation;

    renderHook(() =>
      useMarketingEntrance({
        enabled: false,
        extra: [extraAnimation as never],
        hero: false,
      }),
    );

    const options = mockUseGsapEntrance.mock.calls[0][0] as {
      animations: MockAnimation[];
      enabled?: boolean;
    };
    expect(options.animations.at(-1)).toBe(extraAnimation);
    expect(options.enabled).toBe(false);
  });
});
