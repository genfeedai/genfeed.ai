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
        name: /brief to published\./i,
      }),
    ).toBeInTheDocument();
  });

  it('renders the complete brief-to-analytics lifecycle as an ordered list', () => {
    render(<HomeHow />);

    for (const title of ['Brief', 'Review', 'Publish', 'Measure']) {
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
