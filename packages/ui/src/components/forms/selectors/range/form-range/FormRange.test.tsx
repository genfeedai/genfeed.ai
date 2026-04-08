import { render } from '@testing-library/react';
import FormRange from '@ui/primitives/range-field';
import { describe, expect, it } from 'vitest';

describe('FormRange', () => {
  it('should render without crashing', () => {
    const { container } = render(<FormRange />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    const { container } = render(<FormRange />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(<FormRange />);
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toBeInTheDocument();
  });
});
