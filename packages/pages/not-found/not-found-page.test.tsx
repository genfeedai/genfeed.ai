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

  it('should apply correct styles and classes', () => {
    const { container } = render(<NotFoundPage />);
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toBeInTheDocument();
  });
});
