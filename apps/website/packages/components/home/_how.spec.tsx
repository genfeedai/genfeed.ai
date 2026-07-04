import { render, screen } from '@testing-library/react';
import HomeHow from '@web-components/home/_how';
import { describe, expect, it } from 'vitest';

describe('HomeHow', () => {
  it('renders the section heading', () => {
    render(<HomeHow />);

    expect(
      screen.getByRole('heading', {
        level: 2,
        name: /brief in, campaign out\./i,
      }),
    ).toBeInTheDocument();
  });

  it('renders all three steps', () => {
    render(<HomeHow />);

    for (const title of [
      'Start from a brief',
      'Generate every format',
      'Publish and track',
    ]) {
      expect(
        screen.getByRole('heading', { level: 3, name: title }),
      ).toBeInTheDocument();
    }
  });
});
