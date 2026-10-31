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
        name: /your models, one workspace\./i,
      }),
    ).toBeInTheDocument();
  });

  it('states the catalog totals derived from the model catalog', () => {
    const brands = getProviderBrands();
    const modelCount = brands.reduce(
      (total, brand) => total + brand.modelCount,
      0,
    );

    render(<HomeProviders />);

    expect(
      screen.getByText(
        new RegExp(`${modelCount} models from ${brands.length} providers`),
      ),
    ).toBeInTheDocument();
  });

  it('names only the top few providers instead of the full wall', () => {
    const brands = getProviderBrands();

    render(<HomeProviders />);

    const items = screen.getAllByRole('listitem');
    expect(items.length).toBeGreaterThan(0);
    expect(items.length).toBeLessThanOrEqual(5);
    expect(items.length).toBeLessThan(brands.length);
    expect(screen.getByRole('list')).toHaveAttribute(
      'aria-labelledby',
      'home-providers-heading',
    );
    expect(screen.getByText(brands[0].label)).toBeInTheDocument();
  });

  it('links to the full catalog at /models', () => {
    render(<HomeProviders />);

    expect(
      screen.getByRole('link', { name: /see all models/i }),
    ).toHaveAttribute('href', '/models');
  });
});
