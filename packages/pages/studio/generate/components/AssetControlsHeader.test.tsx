import { IngredientStatus, ViewType } from '@genfeedai/enums';
import { AssetControlsHeader } from '@pages/studio/generate/components/AssetControlsHeader';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

describe('AssetControlsHeader', () => {
  const baseFilters = {
    brand: '',
    favorite: '',
    format: '',
    model: '',
    provider: '',
    search: '',
    sort: '',
    status: [] as string[],
    type: '',
  };

  it('keeps the current category label for assistive technology only', () => {
    render(
      <AssetControlsHeader
        filters={baseFilters}
        onFiltersChange={vi.fn()}
        isImageOrVideo
        supportsMasonry
        viewMode={ViewType.MASONRY}
        onViewModeChange={vi.fn()}
        onRefresh={vi.fn()}
        isRefreshing={false}
        categoryType={'image' as never}
      />,
    );

    expect(
      screen.getByRole('heading', { level: 1, name: 'Image Generation' }),
    ).toHaveClass('sr-only');
  });

  it('renders filters, view toggle, and refresh without nested control shells', () => {
    render(
      <AssetControlsHeader
        filters={{ ...baseFilters, status: [IngredientStatus.PROCESSING] }}
        onFiltersChange={vi.fn()}
        isImageOrVideo
        supportsMasonry
        viewMode={ViewType.MASONRY}
        onViewModeChange={vi.fn()}
        onRefresh={vi.fn()}
        isRefreshing={false}
        categoryType={'video' as never}
      />,
    );

    expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument();
    expect(screen.getByTestId('asset-controls-toolbar')).toBeInTheDocument();
    expect(
      screen.getByTestId('asset-controls-view-toggle'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('asset-controls-refresh')).toBeInTheDocument();

    // ViewToggle owns gen-shell-segmented chrome — no outer rounded-xl shell.
    const viewToggle = screen.getByTestId('asset-controls-view-toggle');
    expect(viewToggle.querySelector('.rounded-xl')).toBeNull();
    expect(viewToggle.querySelector('.shadow-border')).toBeNull();
    expect(viewToggle.querySelector('.gen-shell-segmented')).toBeTruthy();

    // Refresh is a lone icon control, not wrapped in a second bordered pill.
    const refresh = screen.getByTestId('asset-controls-refresh');
    expect(refresh.querySelector('.rounded-xl')).toBeNull();
    expect(refresh.querySelector('.shadow-border')).toBeNull();
  });

  it('uses the shared Studio divider token on the header shell', () => {
    const { container } = render(
      <AssetControlsHeader
        filters={baseFilters}
        onFiltersChange={vi.fn()}
        isImageOrVideo
        supportsMasonry
        viewMode={ViewType.MASONRY}
        onViewModeChange={vi.fn()}
        onRefresh={vi.fn()}
        isRefreshing={false}
        categoryType={'image' as never}
      />,
    );

    expect(container.firstChild).toHaveClass('border-b', 'border-white/[0.08]');
  });
});
