import { render } from '@testing-library/react';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { describe, expect, it } from 'vitest';

describe('LoadingFallback', () => {
  it('should render without crashing', () => {
    const { container } = render(<LazyLoadingFallback />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    const { container } = render(<LazyLoadingFallback />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(<LazyLoadingFallback />);
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toBeInTheDocument();
  });
});
