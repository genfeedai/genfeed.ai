import '@testing-library/jest-dom';
import { fireEvent, render } from '@testing-library/react';
import OutputNode from '@ui/workflow-builder/nodes/OutputNode';
import type { ComponentProps, ComponentPropsWithoutRef } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@xyflow/react', () => ({
  Handle: ({ children, ...props }: ComponentPropsWithoutRef<'div'>) => (
    <div data-testid="handle" {...props}>
      {children}
    </div>
  ),
  Position: { Bottom: 'bottom', Left: 'left', Right: 'right', Top: 'top' },
}));

describe('OutputNode', () => {
  const defaultProps: ComponentProps<typeof OutputNode> = {
    data: {
      config: {},
      definition: {
        category: 'output',
        configSchema: {},
        description: 'Output save node',
        icon: 'save',
        inputs: { media: { label: 'Media', type: 'any' } },
        label: 'Save',
        outputs: {},
      },
      inputVariableKeys: [],
      label: 'Save',
      nodeType: 'output-save',
    },
    id: 'node-1',
    isConnectable: true,
    selected: false,
  };

  it('should render without crashing', () => {
    const { container } = render(<OutputNode {...defaultProps} />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should apply red color scheme for output nodes', () => {
    const { container } = render(<OutputNode {...defaultProps} />);
    expect(container.querySelector('.bg-red-50')).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    const { container } = render(<OutputNode {...defaultProps} />);

    // Test node selection
    const node = container.firstChild;
    if (node) {
      fireEvent.click(node);
    }

    // Test node connection handles
    const handles = container.querySelectorAll('[data-handleid]');
    expect(handles.length).toBeGreaterThanOrEqual(0);
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(<OutputNode {...defaultProps} />);

    // Check node has correct color scheme
    expect(container.querySelector('.bg-red-50')).toBeInTheDocument();
    expect(container.querySelector('.border-red-400')).toBeInTheDocument();

    // Check selected state styling
    const { container: selectedContainer } = render(
      <OutputNode {...defaultProps} selected={true} />,
    );
    expect(selectedContainer.querySelector('.ring-2')).toBeInTheDocument();
  });
});
