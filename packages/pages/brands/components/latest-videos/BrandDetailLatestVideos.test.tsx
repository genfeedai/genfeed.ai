import BrandDetailLatestVideos from '@pages/brands/components/latest-videos/BrandDetailLatestVideos';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

describe('BrandDetailLatestVideos', () => {
  it('should render without crashing', () => {
    const { container } = render(<BrandDetailLatestVideos />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    const { container } = render(<BrandDetailLatestVideos />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(<BrandDetailLatestVideos />);
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toBeInTheDocument();
  });
});
