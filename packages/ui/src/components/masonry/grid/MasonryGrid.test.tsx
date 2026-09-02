import type { IIngredient } from '@genfeedai/contracts/interfaces';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// Mock hooks used by MasonryGrid
vi.mock('@genfeedai/hooks/data/tags/use-tags/use-tags', () => ({
  useTags: () => ({ isLoading: false, tags: [] }),
}));

vi.mock('@genfeedai/hooks/ui/use-masonry-grid/use-masonry-grid', () => ({
  useMasonryGrid: () => ({
    containerHeight: 500,
    containerRef: { current: null },
    isClient: true,
    recalculateLayout: vi.fn(),
  }),
}));

vi.mock(
  '@genfeedai/hooks/ui/use-masonry-hover-controller/use-masonry-hover-controller',
  () => ({
    useMasonryHoverController: () => ({
      createHoverChangeHandler: vi.fn(() => vi.fn()),
      handleGridMouseEnter: vi.fn(),
      handleGridMouseLeave: vi.fn(),
      isGridHovered: false,
      registerItem: vi.fn(() => vi.fn()),
    }),
  }),
);

vi.mock('@ui/lazy/masonry/LazyMasonry', () => ({
  LazyMasonryImage: () => <div data-testid="masonry-image" />,
  LazyMasonryVideo: () => <div data-testid="masonry-video" />,
}));

vi.mock('@ui/card/empty/CardEmpty', () => ({
  default: ({ label }: { label: string }) => <div>{label}</div>,
}));

vi.mock('@ui/display/skeleton/skeleton', () => ({
  SkeletonMasonryGrid: () => <div data-testid="skeleton" />,
}));

import MasonryGrid from '@ui/masonry/grid/MasonryGrid';

describe('MasonryGrid', () => {
  const defaultProps = {
    ingredients: [],
    selectedIngredientId: [],
  };

  it('should render without crashing', () => {
    const { container } = render(<MasonryGrid {...defaultProps} />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should show empty state when no ingredients', () => {
    const { container } = render(<MasonryGrid {...defaultProps} />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should show skeleton when loading', () => {
    const { getByTestId } = render(
      <MasonryGrid {...defaultProps} isLoading={true} />,
    );
    expect(getByTestId('skeleton')).toBeInTheDocument();
  });

  it('compacts column and row gaps', () => {
    const { container } = render(
      <MasonryGrid
        ingredients={[{ id: 'img-1' } as IIngredient]}
        selectedIngredientId={[]}
      />,
    );

    const masonry = container.querySelector('.masonry-container');
    expect(masonry).toHaveStyle({ columnGap: '4px' });
    expect(container.querySelector('.masonry-item')).toHaveClass('mb-1');
  });

  it('uses a denser default column count so library tiles stay compact', () => {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 1280,
    });

    const { container } = render(
      <MasonryGrid
        ingredients={[{ id: 'img-1' } as IIngredient]}
        selectedIngredientId={[]}
      />,
    );

    expect(container.querySelector('.masonry-container')).toHaveStyle({
      columnCount: 5,
    });
  });
});
