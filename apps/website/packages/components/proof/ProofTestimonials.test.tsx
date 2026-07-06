import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ProofTestimonials from './ProofTestimonials';

describe('ProofTestimonials', () => {
  it('renders guarded placeholder proof slots until approved testimonials exist', () => {
    render(<ProofTestimonials context="pricing" />);

    expect(
      screen.getByRole('heading', {
        name: /customer proof, gated by approval\./i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText('Reserved for approved customer proof'),
    ).toHaveLength(3);
    expect(screen.getAllByText('Not public proof yet')).toHaveLength(3);
  });

  it('does not render fabricated testimonial handles or claims', () => {
    render(<ProofTestimonials />);

    expect(screen.queryByText('@contentcreator')).not.toBeInTheDocument();
    expect(
      screen.queryByText(/doubled my posting frequency/i),
    ).not.toBeInTheDocument();
  });
});
