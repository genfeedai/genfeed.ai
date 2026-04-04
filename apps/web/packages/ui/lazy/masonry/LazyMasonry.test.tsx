import '@testing-library/jest-dom';
import { render, waitFor } from '@testing-library/react';
import * as LazyMasonry from '@ui/lazy/masonry/LazyMasonry';
import { describe, expect, it, vi } from 'vitest';

// Mock IntersectionObserver
class MockIntersectionObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
  constructor(callback: IntersectionObserverCallback) {
    // Immediately call callback with mock entry
    setTimeout(() => {
      callback([{ isIntersecting: true } as IntersectionObserverEntry], this);
    }, 0);
  }
}
global.IntersectionObserver = MockIntersectionObserver as any;

// Mock next/dynamic
vi.mock('next/dynamic', () => ({
  __esModule: true,
  default: () => {
    const Component = () => (
      <div data-testid="lazy-component">Lazy Loaded Component</div>
    );

    Component.displayName = 'LazyComponent';
    return Component;
  },
}));

describe('LazyMasonry', () => {
  it('should export LazyMasonryImage', () => {
    expect(LazyMasonry.LazyMasonryImage).toBeDefined();
    expect(typeof LazyMasonry.LazyMasonryImage).toBe('function');
  });

  it('should export LazyMasonryVideo', () => {
    expect(LazyMasonry.LazyMasonryVideo).toBeDefined();
    expect(typeof LazyMasonry.LazyMasonryVideo).toBe('function');
  });

  it('should export LazyMasonryGrid', () => {
    expect(LazyMasonry.LazyMasonryGrid).toBeDefined();
    expect(typeof LazyMasonry.LazyMasonryGrid).toBe('function');
  });

  it('should render LazyMasonryImage when mounted', async () => {
    const { getByTestId } = render(<LazyMasonry.LazyMasonryImage />);
    await waitFor(() => {
      expect(getByTestId('lazy-component')).toBeInTheDocument();
    });
  });

  it('should render LazyMasonryVideo when mounted', async () => {
    const { getByTestId } = render(<LazyMasonry.LazyMasonryVideo />);
    await waitFor(() => {
      expect(getByTestId('lazy-component')).toBeInTheDocument();
    });
  });

  it('should render LazyMasonryGrid when mounted', async () => {
    const { getByTestId } = render(<LazyMasonry.LazyMasonryGrid />);
    await waitFor(() => {
      expect(getByTestId('lazy-component')).toBeInTheDocument();
    });
  });

  it('should have all exported components as functions', () => {
    const exports = Object.values(LazyMasonry);
    exports.forEach((exportedItem) => {
      expect(typeof exportedItem).toBe('function');
    });
  });

  it('should have correct number of exported components', () => {
    const exports = Object.keys(LazyMasonry);
    expect(exports.length).toBe(3); // LazyMasonryImage, LazyMasonryVideo, LazyMasonryGrid
  });
});
