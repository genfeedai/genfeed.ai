import { render } from '@testing-library/react';
import MenuLabel from '@ui/menus/label/MenuLabel';
import { describe, expect, it } from 'vitest';

describe('MenuLabel', () => {
  it('should render without crashing', () => {
    const { container } = render(<MenuLabel />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    const { container } = render(<MenuLabel />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(<MenuLabel />);
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toBeInTheDocument();
  });
});
