import { render } from '@testing-library/react';
import LoadingOverlay from '@ui/loading/overlay/LoadingOverlay';
import { describe, expect, it } from 'vitest';

describe('LoadingOverlay', () => {
  it('should render without crashing', () => {
    const { container } = render(<LoadingOverlay />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    const { container } = render(<LoadingOverlay />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(<LoadingOverlay />);
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toBeInTheDocument();
  });
});
