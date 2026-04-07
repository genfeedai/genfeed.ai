import { render } from '@testing-library/react';
import { SkeletonLoadingFallback } from '@ui/loading/skeleton/SkeletonFallbacks';
import { describe, expect, it } from 'vitest';

describe('SkeletonLoadingFallback', () => {
  it('should render with default masonry type', () => {
    const { container } = render(<SkeletonLoadingFallback />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should render settings skeleton type', () => {
    const { container } = render(<SkeletonLoadingFallback type="settings" />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should render gallery skeleton type', () => {
    const { container } = render(<SkeletonLoadingFallback type="gallery" />);
    expect(container.firstChild).toBeInTheDocument();
  });
});
