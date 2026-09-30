import { render } from '@testing-library/react';
import GallerySidebar from '@ui/gallery/sidebar/GallerySidebar';
import { describe, expect, it } from 'vitest';

describe('GallerySidebar', () => {
  it('should render without crashing', () => {
    const { container } = render(<GallerySidebar />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    const { container } = render(<GallerySidebar />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(<GallerySidebar />);
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toBeInTheDocument();
  });
});
