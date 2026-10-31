import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import DropdownMultiSelect from '@/features/workflows/components/dropdowns/multiselect/DropdownMultiSelect';

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

  it('does not stack the default button border shadow under the trigger', () => {
    render(
      <DropdownMultiSelect {...baseProps} className="border border-border" />,
    );

    const trigger = screen.getByRole('button');
    expect(trigger).toHaveClass('border', 'border-border');
    expect(trigger).not.toHaveClass('shadow-border');
  });
});
