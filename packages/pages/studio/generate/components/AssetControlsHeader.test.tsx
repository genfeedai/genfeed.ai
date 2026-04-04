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

  it('renders the current category label', () => {
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

    expect(screen.getByText('Image Generation')).toBeInTheDocument();
  });

  it('renders a grouped utility toolbar with refresh accessibly labeled', () => {
    const { container } = render(
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
    expect(container.querySelector('.rounded-xl.border')).toBeInTheDocument();
    expect(screen.getByTestId('asset-controls-toolbar')).toBeInTheDocument();
    expect(
      screen.getByTestId('asset-controls-view-toggle'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('asset-controls-refresh')).toBeInTheDocument();
    expect(screen.getAllByTestId('asset-controls-separator')).toHaveLength(2);
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
