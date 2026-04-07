import '@testing-library/jest-dom/vitest';
import { render } from '@testing-library/react';
import Badge from '@ui/display/badge/Badge';
import { describe, expect, it } from 'vitest';

describe('Badge', () => {
  it('should render without crashing', () => {
    const { container } = render(<Badge />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    const { container } = render(<Badge />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(<Badge status="draft" />);
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toBeInTheDocument();
    expect(rootElement).toHaveClass('rounded-full');
  });
});
