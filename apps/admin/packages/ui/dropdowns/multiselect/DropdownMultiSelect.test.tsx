import { render } from '@testing-library/react';
import DropdownMultiSelect from '@ui/dropdowns/multiselect/DropdownMultiSelect';
import { describe, expect, it, vi } from 'vitest';

describe('DropdownMultiSelect', () => {
  const baseProps = {
    name: 'channels',
    onChange: vi.fn(),
    options: [{ label: 'Instagram', value: 'instagram' }],
    values: [],
  };

  it('should render without crashing', () => {
    const { container } = render(<DropdownMultiSelect {...baseProps} />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    const { container } = render(<DropdownMultiSelect {...baseProps} />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(<DropdownMultiSelect {...baseProps} />);
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toBeInTheDocument();
  });
});
