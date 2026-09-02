import { AssetScope } from '@genfeedai/contracts';
import type { IBrand } from '@genfeedai/contracts/interfaces';
import BrandDetailOverview from '@pages/brands/components/overview/BrandDetailOverview';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

const brand = {
  description: 'Content for ambitious teams',
  label: 'Acme',
  logoUrl: 'https://example.test/logo.png',
  scope: AssetScope.BRAND,
  slug: 'acme',
} as IBrand;

function renderOverview(
  onUpdateBrand: (
    field: 'label' | 'description',
    value: string,
  ) => Promise<void> = vi.fn(),
) {
  return render(
    <BrandDetailOverview
      brand={brand}
      isGeneratingLogo={false}
      onGenerateLogo={vi.fn()}
      onUpdateBrand={onUpdateBrand}
      onUploadLogo={vi.fn()}
    />,
  );
}

describe('BrandDetailOverview', () => {
  it('renders the brand identity and keeps the slug read-only', () => {
    renderOverview();

    expect(
      screen.getByRole('button', { name: 'Edit brand name' }),
    ).toHaveTextContent('Acme');
    expect(screen.getByText('@acme')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Edit brand description' }),
    ).toHaveTextContent('Content for ambitious teams');
  });

  it('saves an edited brand name', async () => {
    const user = userEvent.setup();
    const onUpdateBrand = vi.fn().mockResolvedValue(undefined);
    renderOverview(onUpdateBrand);

    await user.click(screen.getByRole('button', { name: 'Edit brand name' }));
    const editor = screen.getByRole('textbox', { name: 'Edit brand name' });
    await user.clear(editor);
    await user.type(editor, 'Acme Labs');
    await user.keyboard('{Enter}');

    await waitFor(() =>
      expect(onUpdateBrand).toHaveBeenCalledWith('label', 'Acme Labs'),
    );
  });

  it('shows the description placeholder when no description exists', () => {
    render(
      <BrandDetailOverview
        brand={{ ...brand, description: '' }}
        isGeneratingLogo={false}
        onGenerateLogo={vi.fn()}
        onUpdateBrand={vi.fn()}
        onUploadLogo={vi.fn()}
      />,
    );

    expect(
      screen.getByRole('button', { name: 'Edit brand description' }),
    ).toHaveTextContent('Add a description');
  });
});
