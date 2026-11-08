import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import BookingSection from './BookingSection';

vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: {
    calendly: 'https://calendar.app.google/S2Crg8uCe1dVnWRN6',
  },
}));

describe('BookingSection', () => {
  it('offers a direct booking link at the existing anchor without an embedded calendar', () => {
    const { container } = render(<BookingSection />);
    expect(container.querySelector('section#book')).not.toBeNull();
    expect(container.querySelector('iframe')).toBeNull();
    const booking = screen.getByRole('link', { name: 'Book a call' });
    expect(booking).toHaveAttribute(
      'href',
      'https://calendar.app.google/S2Crg8uCe1dVnWRN6',
    );
    expect(booking).toHaveAttribute('target', '_blank');
    expect(booking).toHaveAttribute('rel', 'noopener noreferrer');
  });
});
