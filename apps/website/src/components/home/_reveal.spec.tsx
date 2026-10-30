// biome-ignore assist/source/organizeImports: External packages precede project aliases.
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import HomeContent from '@public/(home)/home-content';
import HomeReveal, {
  HOME_REVEAL_ANIMATIONS,
} from '@web-components/home/_reveal';

const useGsapEntrance = vi.fn(() => ({ current: null }));

vi.mock('@hooks/ui/use-gsap-entrance', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@hooks/ui/use-gsap-entrance')>()),
  useGsapEntrance: (options: unknown) => useGsapEntrance(options),
}));

describe('HomeReveal', () => {
  it('registers the reveal animations on its container', () => {
    render(
      <HomeReveal>
        <section>Child</section>
      </HomeReveal>,
    );

    expect(screen.getByTestId('home-reveal')).toContainElement(
      screen.getByText('Child'),
    );
    expect(useGsapEntrance).toHaveBeenCalledWith({
      animations: HOME_REVEAL_ANIMATIONS,
    });
  });

  it('gives every reveal its own scroll trigger', () => {
    for (const animation of HOME_REVEAL_ANIMATIONS) {
      expect(animation.scrollTrigger?.batch).toBe(true);
    }
  });

  it('only marks homepage elements with kinds the reveal table animates', () => {
    const { container } = render(<HomeContent />);
    const marked = container.querySelectorAll('[data-reveal]');
    const animated = new Set(
      HOME_REVEAL_ANIMATIONS.map((animation) => animation.selector),
    );

    expect(marked.length).toBeGreaterThan(0);
    for (const element of marked) {
      expect(animated).toContain(
        `[data-reveal="${element.getAttribute('data-reveal')}"]`,
      );
    }
  });
});
