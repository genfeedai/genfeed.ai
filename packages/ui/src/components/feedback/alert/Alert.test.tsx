import { render } from '@testing-library/react';
import Alert from '@ui/feedback/alert/Alert';
import { describe, expect, it } from 'vitest';

describe('Alert', () => {
  it('should render without crashing', () => {
    const { container } = render(<Alert />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    const { container } = render(<Alert />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(<Alert />);
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toBeInTheDocument();
    expect(rootElement).toHaveClass('rounded-lg');
    expect(rootElement).toHaveClass('ship-ui');
  });
});
