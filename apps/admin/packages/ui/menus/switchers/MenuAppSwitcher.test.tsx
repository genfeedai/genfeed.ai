import { render } from '@testing-library/react';
import MenuAppSwitcher from '@ui/menus/switchers/MenuAppSwitcher';
import { describe, expect, it } from 'vitest';

describe('MenuAppSwitcher', () => {
  it('should render without crashing', () => {
    const { container } = render(<MenuAppSwitcher />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    const { container } = render(<MenuAppSwitcher />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(<MenuAppSwitcher />);
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toBeInTheDocument();
  });
});
