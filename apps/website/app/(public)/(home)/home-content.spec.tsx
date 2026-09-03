// biome-ignore assist/source/organizeImports: External packages precede project aliases.
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import HomeContent from '@public/(home)/home-content';

vi.mock('@web-components/home/_hero', () => ({
  default: () => <section data-testid="home-hero">Hero</section>,
}));

vi.mock('@web-components/home/_how', () => ({
  default: () => <section data-testid="home-distribution-loop">Loop</section>,
}));

vi.mock('@web-components/home/_product', () => ({
  default: () => <section data-testid="home-product">Product</section>,
}));

vi.mock('@web-components/home/_formats', () => ({
  default: () => <section data-testid="home-formats">Formats</section>,
}));

vi.mock('@web-components/proof/ProofWinners', () => ({
  default: () => <section data-testid="home-winners">Winners</section>,
}));

vi.mock('@web-components/home/_cta', () => ({
  default: () => <section data-testid="home-cta">CTA</section>,
}));

vi.mock('@web-components/home/_footer', () => ({
  default: () => <footer>Footer</footer>,
}));

vi.mock('@hooks/ui/use-gsap-entrance', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@hooks/ui/use-gsap-entrance')>()),
  useGsapEntrance: () => ({ current: null }),
}));

describe('HomeContent', () => {
  it('wraps every section in the scroll reveal container', () => {
    render(<HomeContent />);

    expect(screen.getByTestId('home-reveal')).toContainElement(
      screen.getByTestId('home-hero'),
    );
    expect(screen.getByTestId('home-reveal')).toContainElement(
      screen.getByTestId('home-cta'),
    );
  });

  it('shows output first and the product mechanism second', () => {
    render(<HomeContent />);
    const sections = Array.from(screen.getByTestId('home-reveal').children);

    expect(sections[0]).toBe(screen.getByTestId('home-hero'));
    expect(sections[1]).toBe(screen.getByTestId('home-product'));
  });

  it('places verified proof after product and before explanation', () => {
    render(<HomeContent />);
    const sections = Array.from(screen.getByTestId('home-reveal').children);

    expect(sections[2]).toBe(screen.getByTestId('home-winners'));
    expect(sections[3]).toBe(screen.getByTestId('home-distribution-loop'));
    expect(sections[4]).toBe(screen.getByTestId('home-formats'));
    expect(sections[5]).toBe(screen.getByTestId('home-cta'));
  });

  it('drops the sections that moved to pricing and the FAQ page', () => {
    render(<HomeContent />);

    expect(screen.queryByText(/audiences/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/credits/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/faq/i)).not.toBeInTheDocument();
  });
});
