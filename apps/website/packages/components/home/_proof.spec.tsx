import { render, screen } from '@testing-library/react';
import HomeProof from '@web-components/home/_proof';
import { describe, expect, it } from 'vitest';

describe('HomeProof', () => {
  it('renders the section heading', () => {
    render(<HomeProof />);

    expect(
      screen.getByRole('heading', {
        level: 2,
        name: /brand-safe, approved, tracked\./i,
      }),
    ).toBeInTheDocument();
  });

  it('renders the example campaign cards', () => {
    render(<HomeProof />);

    for (const handle of ['kai.travels', 'nova.styles', 'aria.digital']) {
      expect(screen.getByText(handle)).toBeInTheDocument();
    }
  });
});
