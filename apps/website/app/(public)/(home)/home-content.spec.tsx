import HomeContent from '@public/(home)/home-content';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@web-components/home/_hero', () => ({
  default: () => <section data-testid="home-hero">Hero</section>,
}));

vi.mock('@web-components/home/_how', () => ({
  default: () => <section data-testid="home-distribution-loop">Loop</section>,
}));

vi.mock('@web-components/home/_formats', () => ({
  default: () => <section data-testid="home-formats">Formats</section>,
}));

vi.mock('@web-components/home/_proof', () => ({
  default: () => <section>Proof</section>,
}));

vi.mock('@web-components/proof/ProofTestimonials', () => ({
  default: () => <section>Testimonials</section>,
}));

vi.mock('@web-components/home/_audiences', () => ({
  default: () => <section>Audiences</section>,
}));

vi.mock('@web-components/home/_credits', () => ({
  default: () => <section>Credits</section>,
}));

vi.mock('@web-components/home/_faq', () => ({
  default: () => <section>FAQ</section>,
}));

vi.mock('@web-components/home/_cta', () => ({
  default: () => <section>CTA</section>,
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
});
