import { render, screen } from '@testing-library/react';
import HomeHow from '@web-components/home/_how';
import { describe, expect, it } from 'vitest';

describe('HomeHow', () => {
  it('renders the section heading', () => {
    render(<HomeHow />);

    expect(
      screen.getByRole('heading', {
        level: 2,
        name: /create, review, schedule, and publish — in one place\./i,
      }),
    ).toBeInTheDocument();
  });

  it('renders the complete brief-to-analytics lifecycle as an ordered list', () => {
    render(<HomeHow />);

    for (const title of [
      'Start from a brief',
      'Review and refine',
      'Schedule and publish',
      'Measure what shipped',
    ]) {
      expect(
        screen.getByRole('heading', { level: 3, name: title }),
      ).toBeInTheDocument();
    }

    expect(screen.getByRole('list')).toHaveAttribute(
      'aria-labelledby',
      'home-workflow-heading',
    );
    expect(screen.getAllByRole('listitem')).toHaveLength(4);
  });
});
