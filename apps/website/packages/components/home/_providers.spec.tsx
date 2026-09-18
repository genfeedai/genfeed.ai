// biome-ignore assist/source/organizeImports: External packages precede project aliases.
import { getProviderBrands } from '@genfeedai/helpers';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import HomeProviders from '@web-components/home/_providers';

describe('HomeProviders', () => {
  it('renders the section heading', () => {
    render(<HomeProviders />);

    expect(
      screen.getByRole('heading', {
        level: 2,
        name: /every model, one workspace\./i,
      }),
    ).toBeInTheDocument();
  });

  it('renders one tile per catalog brand rather than a curated list', () => {
    const brands = getProviderBrands();

    render(<HomeProviders />);

    expect(screen.getAllByRole('listitem')).toHaveLength(brands.length);
    expect(screen.getByRole('list')).toHaveAttribute(
      'aria-labelledby',
      'home-providers-heading',
    );
  });

  it('names Higgsfield alongside the other generation providers', () => {
    render(<HomeProviders />);

    for (const label of ['Higgsfield', 'Replicate', 'Fal']) {
      expect(
        screen.getByRole('heading', { level: 3, name: label }),
      ).toBeInTheDocument();
    }
  });
});
