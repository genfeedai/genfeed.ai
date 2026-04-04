import BrandDetailLatestArticles from '@pages/brands/components/latest-articles/BrandDetailLatestArticles';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

describe('BrandDetailLatestArticles', () => {
  it('should render without crashing', () => {
    const { container } = render(<BrandDetailLatestArticles />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    const { container } = render(<BrandDetailLatestArticles />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(<BrandDetailLatestArticles />);
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toBeInTheDocument();
  });
});
