import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import BrandRequiredState from '@/components/states/BrandRequiredState';
import '@testing-library/jest-dom/vitest';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

describe('BrandRequiredState', () => {
  it('asks for a brand and links to Manage brands', () => {
    render(<BrandRequiredState brandSettingsHref="/acme/~/settings/brands" />);

    expect(screen.getByText('Select a brand')).toBeVisible();
    expect(
      screen.getByText('Pick one in the top bar to continue.'),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: 'Manage brands' })).toHaveAttribute(
      'href',
      '/acme/~/settings/brands',
    );
  });

  it('shows only the loading line, with no link, while the brand loads', () => {
    render(
      <BrandRequiredState
        brandSettingsHref="/acme/~/settings/brands"
        isLoading
      />,
    );

    expect(screen.getByText('Loading the selected brand…')).toBeVisible();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
