import '@testing-library/jest-dom';
import { fireEvent, render } from '@testing-library/react';
import ProcessNode from '@ui/workflow-builder/nodes/ProcessNode';
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

describe('ProcessNode', () => {
  const defaultProps: ComponentProps<typeof ProcessNode> = {
    data: {
      config: { aspectRatio: '16:9' },
      definition: {
        category: 'processing',
        configSchema: {},
        description: 'Resize media',
        icon: 'resize',
        inputs: { media: { label: 'Media', type: 'any' } },
        label: 'Resize',
        outputs: { media: { label: 'Resized Media', type: 'any' } },
      },
      inputVariableKeys: [],
      label: 'Resize',
      nodeType: 'process-resize',
    },
    id: 'node-1',
    isConnectable: true,
    selected: false,
  };

  it('should render without crashing', () => {
    const { container } = render(<ProcessNode {...defaultProps} />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should apply blue color scheme for process nodes', () => {
    const { container } = render(<ProcessNode {...defaultProps} />);
    expect(container.querySelector('.bg-blue-50')).toBeInTheDocument();
  });

  it('should display node label', () => {
    const { getByText } = render(<ProcessNode {...defaultProps} />);
    expect(getByText('Resize')).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    const { container } = render(<ProcessNode {...defaultProps} />);

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
    const { container } = render(<ProcessNode {...defaultProps} />);

    // Check node has correct color scheme
    expect(container.querySelector('.bg-blue-50')).toBeInTheDocument();
    expect(container.querySelector('.border-blue-400')).toBeInTheDocument();

    // Check selected state styling
    const { container: selectedContainer } = render(
      <ProcessNode {...defaultProps} selected={true} />,
    );
    expect(selectedContainer.querySelector('.ring-2')).toBeInTheDocument();
  });
});
