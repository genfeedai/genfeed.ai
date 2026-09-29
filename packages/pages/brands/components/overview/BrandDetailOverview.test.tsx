import { AssetScope } from '@genfeedai/contracts';
import type { IBrand } from '@genfeedai/contracts/interfaces';
import BrandDetailOverview from '@pages/brands/components/overview/BrandDetailOverview';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../../../apps/app/tests/next-intl.stub'
  );
  return { useTranslations: translateFromCatalog };
});

const brand = {
  description: 'Content for ambitious teams',
  label: 'Acme',
  logoUrl: 'https://example.test/logo.png',
  scope: AssetScope.BRAND,
  slug: 'acme',
} as IBrand;

function renderOverview({
  onUpdateBrand = vi.fn(),
  onUpdateHandle,
}: {
  onUpdateBrand?: (
    field: 'label' | 'description',
    value: string,
  ) => Promise<void>;
  onUpdateHandle?: (value: string) => Promise<void>;
} = {}) {
  return render(
    <BrandDetailOverview
      brand={brand}
      isGeneratingLogo={false}
      onGenerateLogo={vi.fn()}
      onUpdateBrand={onUpdateBrand}
      onUpdateHandle={onUpdateHandle}
      onUploadLogo={vi.fn()}
    />,
  );
}

describe('BrandDetailOverview', () => {
  it('renders the brand identity with a read-only handle when it cannot be edited', () => {
    renderOverview();

    expect(
      screen.getByRole('button', { name: 'Edit brand name' }),
    ).toHaveTextContent('Acme');
    expect(screen.getByText('@acme')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Edit brand handle' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Edit brand description' }),
    ).toHaveTextContent('Content for ambitious teams');
  });

  it('reverts the handle when the save is rejected', async () => {
    const user = userEvent.setup();
    const onUpdateHandle = vi.fn().mockRejectedValue(new Error('taken'));
    renderOverview({ onUpdateHandle });

    await user.click(screen.getByRole('button', { name: 'Edit brand handle' }));
    const editor = screen.getByRole('textbox', { name: 'Edit brand handle' });
    await user.clear(editor);
    await user.type(editor, 'taken');
    await user.keyboard('{Enter}');

    expect(
      await screen.findByRole('button', { name: 'Edit brand handle' }),
    ).toHaveTextContent('@acme');
  });

  it('saves an edited brand name', async () => {
    const user = userEvent.setup();
    const onUpdateBrand = vi.fn().mockResolvedValue(undefined);
    renderOverview({ onUpdateBrand });

    await user.click(screen.getByRole('button', { name: 'Edit brand name' }));
    const editor = screen.getByRole('textbox', { name: 'Edit brand name' });
    await user.clear(editor);
    await user.type(editor, 'Acme Labs');
    await user.keyboard('{Enter}');

    await waitFor(() =>
      expect(onUpdateBrand).toHaveBeenCalledWith('label', 'Acme Labs'),
    );
  });
});
