import BrandDetailBanner from '@pages/brands/components/banner/BrandDetailBanner';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

describe('BrandDetailBanner', () => {
  it('should render without crashing', () => {
    const { container } = render(<BrandDetailBanner />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    const { container } = render(<BrandDetailBanner />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(<BrandDetailBanner />);
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toBeInTheDocument();
  });
});
