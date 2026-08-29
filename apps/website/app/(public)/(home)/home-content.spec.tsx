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

describe('HomeContent', () => {
  it('explains the distribution loop in the first two sections', () => {
    const { container } = render(<HomeContent />);
    const sections = Array.from(container.children);

    expect(sections[0]).toBe(screen.getByTestId('home-hero'));
    expect(sections[1]).toBe(screen.getByTestId('home-distribution-loop'));
    expect(sections[2]).toBe(screen.getByTestId('home-formats'));
  });

  it('places proof between the formats grid and the closing CTA', () => {
    const { container } = render(<HomeContent />);
    const sections = Array.from(container.children);

    expect(sections[3]).toBe(screen.getByTestId('home-winners'));
    expect(sections[4]).toBe(screen.getByTestId('home-cta'));
  });

  it('drops the sections that moved to pricing and the FAQ page', () => {
    render(<HomeContent />);

    expect(screen.queryByText(/audiences/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/credits/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/faq/i)).not.toBeInTheDocument();
  });
});
