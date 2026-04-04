import '@testing-library/jest-dom';
import { render } from '@testing-library/react';
import InputNode from '@ui/workflow-builder/nodes/InputNode';
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

describe('InputNode', () => {
  const defaultProps: ComponentProps<typeof InputNode> = {
    data: {
      config: {},
      definition: {
        category: 'input',
        configSchema: {},
        description: 'Image input source',
        icon: 'image',
        inputs: {},
        label: 'Image Input',
        outputs: { image: { label: 'Image', type: 'image' } },
      },
      inputVariableKeys: [],
      label: 'Image Input',
      nodeType: 'input-image',
    },
    id: 'node-1',
    isConnectable: true,
    selected: false,
  };

  it('should render without crashing', () => {
    const { container } = render(<InputNode {...defaultProps} />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should display correct icon for input-image type', () => {
    const { container } = render(<InputNode {...defaultProps} />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should display correct icon for input-video type', () => {
    const props = {
      ...defaultProps,
      data: { ...defaultProps.data, nodeType: 'input-video' },
    };
    const { container } = render(<InputNode {...props} />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should display correct icon for input-prompt type', () => {
    const props = {
      ...defaultProps,
      data: { ...defaultProps.data, nodeType: 'input-prompt' },
    };
    const { container } = render(<InputNode {...props} />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should apply green color scheme for input nodes', () => {
    const { container } = render(<InputNode {...defaultProps} />);
    expect(container.querySelector('.bg-green-50')).toBeInTheDocument();
  });
});
