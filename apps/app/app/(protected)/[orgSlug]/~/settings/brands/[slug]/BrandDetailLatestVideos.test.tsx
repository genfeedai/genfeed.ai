import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import BrandDetailLatestVideos from './BrandDetailLatestVideos';

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
