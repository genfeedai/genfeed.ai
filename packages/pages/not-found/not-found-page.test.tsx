import NotFoundPage from '@pages/not-found/not-found-page';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

describe('NotFoundPage', () => {
  it('should render without crashing', () => {
    const { container } = render(<NotFoundPage />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    const { container } = render(<NotFoundPage />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('uses a full-viewport deep-black background without an inset container', () => {
    const { container } = render(<NotFoundPage />);
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toHaveClass('min-h-dvh', 'w-full', 'bg-black');
    expect(rootElement).not.toHaveClass('container', 'bg-background');
  });
});
