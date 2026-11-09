import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ProfileMediaCredit from './ProfileMediaCredit';

describe('ProfileMediaCredit', () => {
  it('credits the model and links to its catalog entry', () => {
    render(<ProfileMediaCredit modelKey="veo-3" modelLabel="Veo 3" />);

    expect(screen.getByRole('link', { name: 'Veo 3' })).toHaveAttribute(
      'href',
      '/models#model-veo-3',
    );
    expect(screen.getByRole('link', { name: 'Make your own' })).toHaveAttribute(
      'href',
      expect.stringContaining('/sign-up'),
    );
  });

  it('still offers "Make your own" when the model is not listed', () => {
    render(<ProfileMediaCredit modelKey="retired-model" />);

    expect(screen.queryByText(/Made with/)).not.toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Make your own' }),
    ).toBeInTheDocument();
  });
});
