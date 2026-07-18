import { render, screen } from '@testing-library/react';
import HomeHow from '@web-components/home/_how';
import { describe, expect, it } from 'vitest';

describe('HomeHow', () => {
  it('renders the section heading', () => {
    render(<HomeHow />);

    expect(
      screen.getByRole('heading', {
        level: 2,
        name: /your ai client creates\. genfeed controls distribution\./i,
      }),
    ).toBeInTheDocument();
  });

  it('renders the complete agent-to-analytics lifecycle as an ordered list', () => {
    render(<HomeHow />);

    for (const title of [
      'Create in your AI client',
      'Route through Genfeed',
      'Approve and publish',
      'Measure what shipped',
    ]) {
      expect(
        screen.getByRole('heading', { level: 3, name: title }),
      ).toBeInTheDocument();
    }

    expect(screen.getByRole('list')).toHaveAttribute(
      'aria-labelledby',
      'distribution-loop-heading',
    );
    expect(screen.getAllByRole('listitem')).toHaveLength(4);
  });
});
