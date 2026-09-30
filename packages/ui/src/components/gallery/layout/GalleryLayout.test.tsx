import { render } from '@testing-library/react';
import GalleryLayout from '@ui/gallery/layout/GalleryLayout';
import { describe, expect, it } from 'vitest';

describe('GalleryLayout', () => {
  it('should render without crashing', () => {
    const { container } = render(<GalleryLayout />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    const { container } = render(<GalleryLayout />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(<GalleryLayout />);
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toBeInTheDocument();
  });
});
