import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import HomePricing from './_pricing';

describe('HomePricing', () => {
  it('lists the four plans the pricing page sells, with prices', () => {
    render(<HomePricing />);

    expect(
      screen.getByRole('heading', { level: 2, name: 'What it costs' }),
    ).toBeInTheDocument();
    for (const label of ['Pay As You Go', 'Pro', 'Scale', 'Done for you']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(
      screen.getByRole('link', { name: 'View all plans' }),
    ).toHaveAttribute('href', '/pricing');
  });
});
