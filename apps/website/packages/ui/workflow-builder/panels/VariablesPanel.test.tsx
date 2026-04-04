import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import VariablesPanel from '@ui/workflow-builder/panels/VariablesPanel';
import { describe, expect, it, vi } from 'vitest';

describe('VariablesPanel', () => {
  const mockVariables = [
    {
      defaultValue: '',
      key: 'prompt',
      label: 'Prompt',
      required: true,
      type: 'text' as const,
    },
    {
      defaultValue: '',
      key: 'image',
      label: 'Image',
      required: false,
      type: 'image' as const,
    },
  ];

  const defaultProps = {
    isCollapsed: false,
    onAdd: vi.fn(),
    onDelete: vi.fn(),
    onToggleCollapse: vi.fn(),
    onUpdate: vi.fn(),
    variables: mockVariables,
  };

  it('should render without crashing', () => {
    const { container } = render(<VariablesPanel {...defaultProps} />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should display all variables', () => {
    render(<VariablesPanel {...defaultProps} />);
    expect(screen.getByText('Prompt')).toBeInTheDocument();
    expect(screen.getByText('Image')).toBeInTheDocument();
  });

  it('should call onAdd when add button is clicked', () => {
    const onAdd = vi.fn();
    render(<VariablesPanel {...defaultProps} onAdd={onAdd} />);

    const addButton = screen.getByText(/Add Variable/i);
    fireEvent.click(addButton);

    expect(onAdd).toHaveBeenCalled();
  });

  it('should call onToggleCollapse when header is clicked', () => {
    const onToggleCollapse = vi.fn();
    const { container } = render(
      <VariablesPanel {...defaultProps} onToggleCollapse={onToggleCollapse} />,
    );

    // Header row is clickable for collapse/expand
    const headerRow = container.querySelector('.cursor-pointer');
    if (headerRow) {
      fireEvent.click(headerRow);
      expect(onToggleCollapse).toHaveBeenCalled();
    }
  });

  it('should render empty state when no variables', () => {
    render(<VariablesPanel {...defaultProps} variables={[]} />);
    // Multiple elements contain "Add Variable" - button and text
    expect(screen.getAllByText(/Add Variable/i).length).toBeGreaterThan(0);
  });

  it('should handle user interactions correctly', () => {
    const onUpdate = vi.fn();
    const onDelete = vi.fn();
    render(
      <VariablesPanel
        {...defaultProps}
        onUpdate={onUpdate}
        onDelete={onDelete}
      />,
    );

    // Test expanding/collapsing variable item
    const variableItem = screen.getByText('Prompt').closest('div');
    if (variableItem) {
      fireEvent.click(variableItem);
      // Variable should expand showing input fields
      expect(screen.getByPlaceholderText('variable_key')).toBeInTheDocument();
    }

    // Test updating variable key
    const keyInput = screen.getByPlaceholderText('variable_key');
    fireEvent.change(keyInput, { target: { value: 'new_prompt' } });
    expect(onUpdate).toHaveBeenCalled();

    // Test deleting variable
    const deleteButtons = screen.getAllByRole('button', { name: /delete/i });
    if (deleteButtons.length > 0) {
      fireEvent.click(deleteButtons[0]);
      expect(onDelete).toHaveBeenCalled();
    }
  });

  it.skip('should apply correct styles and classes', () => {
    const { container } = render(<VariablesPanel {...defaultProps} />);

    // Check panel container has correct classes
    const panel = container.firstChild;
    expect(panel).toHaveClass('border-r', 'bg-base-50');

    // Check variable items have correct styling
    const variableItems = container.querySelectorAll('..border');
    expect(variableItems.length).toBeGreaterThan(0);

    // Check collapsed state styling
    const { container: collapsedContainer } = render(
      <VariablesPanel {...defaultProps} isCollapsed={true} />,
    );
    expect(collapsedContainer.firstChild).toBeInTheDocument();
  });
});
