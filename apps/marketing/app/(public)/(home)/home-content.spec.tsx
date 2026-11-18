// biome-ignore assist/source/organizeImports: External packages precede project aliases.
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import HomeContent from '@public/(home)/home-content';

vi.mock('@web-components/home/_hero', () => ({
  default: () => <section data-testid="home-hero">Hero</section>,
}));

vi.mock('@web-components/home/_agents', () => ({
  default: () => <section data-testid="home-agents">Agents</section>,
}));

vi.mock('@web-components/home/_how', () => ({
  default: () => <section data-testid="home-how">How</section>,
}));

vi.mock('@web-components/home/_product', () => ({
  default: () => <section data-testid="home-product">Product</section>,
}));

vi.mock('@web-components/home/_providers', () => ({
  default: () => <section data-testid="home-providers">Providers</section>,
}));

vi.mock('@web-components/home/_asks', () => ({
  default: () => <section data-testid="home-asks">Asks</section>,
}));

vi.mock('@web-components/home/_loop', () => ({
  default: () => <section data-testid="home-loop">Loop</section>,
}));

vi.mock('@web-components/home/_faq', () => ({
  default: () => <section data-testid="home-faq">FAQ</section>,
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

  it('shows output first, then what it makes, then what it manages', () => {
    render(<HomeContent />);
    const sections = Array.from(screen.getByTestId('home-reveal').children);

    expect(sections[0]).toBe(screen.getByTestId('home-hero'));
    expect(sections[1]).toBe(screen.getByTestId('home-product'));
    expect(sections[2]).toBe(screen.getByTestId('home-loop'));
  });

  it('puts the agent entry and how it works before the examples', () => {
    render(<HomeContent />);
    const sections = Array.from(screen.getByTestId('home-reveal').children);

    expect(sections[3]).toBe(screen.getByTestId('home-agents'));
    expect(sections[4]).toBe(screen.getByTestId('home-how'));
    expect(sections[5]).toBe(screen.getByTestId('home-asks'));
  });

  // The providers wall is supporting depth, not part of the opening claim.
  it('places the providers wall and the questions after the examples, then the close', () => {
    render(<HomeContent />);
    const sections = Array.from(screen.getByTestId('home-reveal').children);

    expect(sections[6]).toBe(screen.getByTestId('home-providers'));
    expect(sections[7]).toBe(screen.getByTestId('home-faq'));
    expect(sections[8]).toBe(screen.getByTestId('home-cta'));
  });

  it('keeps the newsletter in the footer, not as a page section', () => {
    render(<HomeContent />);

    expect(screen.queryByTestId('home-newsletter')).not.toBeInTheDocument();
    expect(screen.queryByText(/newsletter/i)).not.toBeInTheDocument();
  });

  it('carries no proof section built on a single post', () => {
    render(<HomeContent />);

    expect(screen.queryByTestId('home-winners')).not.toBeInTheDocument();
  });

  it('drops the sections that moved to pricing', () => {
    render(<HomeContent />);

    expect(screen.queryByText(/audiences/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/credits/i)).not.toBeInTheDocument();
  });
});
