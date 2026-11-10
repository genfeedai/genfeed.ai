// biome-ignore assist/source/organizeImports: External packages precede project aliases.
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import HomeHow from '@web-components/home/_how';

describe('HomeHow', () => {
  it('renders the section heading', () => {
    render(<HomeHow />);

    expect(
      screen.getByRole('heading', {
        level: 2,
        name: /connect, ask, review\./i,
      }),
    ).toBeInTheDocument();
  });

  it.each(['Connect', 'Ask', 'Review'])('names the %s step', (title) => {
    render(<HomeHow />);

    expect(
      screen.getByRole('heading', { level: 3, name: title }),
    ).toBeInTheDocument();
  });

  it('sends review and results to the dashboard', () => {
    render(<HomeHow />);

    expect(
      screen.getByText(
        'Open the dashboard to approve drafts, publish to your channels and see what worked.',
      ),
    ).toBeInTheDocument();
  });

  it('renders the three steps as an ordered list', () => {
    render(<HomeHow />);

    expect(screen.getByRole('list')).toHaveAttribute(
      'aria-labelledby',
      'home-workflow-heading',
    );
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
  });
});
