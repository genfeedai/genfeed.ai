import { getApprovedTestimonials } from '@data/testimonials.data';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProofTestimonials from './ProofTestimonials';

vi.mock('@data/testimonials.data', () => ({
  getApprovedTestimonials: vi.fn(() => []),
}));

const mockedApprovedTestimonials = vi.mocked(getApprovedTestimonials);

describe('ProofTestimonials', () => {
  beforeEach(() => {
    mockedApprovedTestimonials.mockReset();
  });

  it('renders nothing until an approved customer testimonial exists', () => {
    mockedApprovedTestimonials.mockReturnValue([]);

    const { container } = render(<ProofTestimonials context="pricing" />);

    expect(container).toBeEmptyDOMElement();
  });

  it('renders approved testimonials with their attributed metric', () => {
    mockedApprovedTestimonials.mockReturnValue([
      {
        attribution: 'Dana Ruiz',
        id: 'dana-ruiz',
        metricLabel: '60-day engagement lift',
        metricValue: '+38%',
        quote: 'We publish four times as often with the same team.',
        role: 'Head of Content',
      },
    ]);

    render(<ProofTestimonials context="pricing" />);

    expect(
      screen.getByText(/we publish four times as often/i),
    ).toBeInTheDocument();
    expect(screen.getByText('Dana Ruiz')).toBeInTheDocument();
    expect(screen.getByText('+38%')).toBeInTheDocument();
  });

  it('never renders placeholder proof slots', () => {
    mockedApprovedTestimonials.mockReturnValue([]);

    render(<ProofTestimonials />);

    expect(screen.queryByText(/not public proof yet/i)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/reserved for approved customer proof/i),
    ).not.toBeInTheDocument();
  });
});
