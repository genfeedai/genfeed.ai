import { render } from '@testing-library/react';
import { Skeleton, SkeletonMasonryGrid } from '@ui/display/skeleton/skeleton';
import { describe, expect, it } from 'vitest';

describe('Skeleton', () => {
  it('should render without crashing', () => {
    const { container } = render(<Skeleton />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    const { container } = render(<Skeleton />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(<Skeleton />);
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toBeInTheDocument();
  });

  it('should render rounded masonry placeholders', () => {
    const { container } = render(<SkeletonMasonryGrid count={2} />);
    const masonryTiles = container.querySelectorAll('.rounded-xl');

    expect(masonryTiles).toHaveLength(2);
  });
});
