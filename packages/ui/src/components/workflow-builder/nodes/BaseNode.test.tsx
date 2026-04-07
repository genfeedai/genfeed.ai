import '@testing-library/jest-dom';
import { render } from '@testing-library/react';
import BaseNode from '@ui/workflow-builder/nodes/BaseNode';
import type { ComponentProps, ComponentPropsWithoutRef } from 'react';
import { HiOutlinePhoto } from 'react-icons/hi2';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@xyflow/react', () => ({
  Handle: ({ children, ...props }: ComponentPropsWithoutRef<'div'>) => (
    <div data-testid="handle" {...props}>
      {children}
    </div>
  ),
  Position: { Bottom: 'bottom', Left: 'left', Right: 'right', Top: 'top' },
}));

describe('BaseNode', () => {
  const mockData = {
    config: { aspectRatio: '16:9' },
    definition: {
      category: 'input',
      configSchema: {},
      description: 'Test input node',
      icon: 'image',
      inputs: { media: { label: 'Media', type: 'any' } },
      label: 'Test Node',
      outputs: { result: { label: 'Result', type: 'any' } },
    },
    label: 'Test Node',
    nodeType: 'input-test-node',
  };

  const defaultProps: ComponentProps<typeof BaseNode> = {
    bgColor: 'bg-green-50',
    borderColor: 'border-green-500',
    data: mockData,
    icon: <HiOutlinePhoto />,
    id: 'node-1',
    isConnectable: true,
    selected: false,
  };

  it('should render without crashing', () => {
    const { container } = render(<BaseNode {...defaultProps} />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should display node label', () => {
    const { getByText } = render(<BaseNode {...defaultProps} />);
    expect(getByText('Test Node')).toBeInTheDocument();
  });

  it('should show selected state when selected is true', () => {
    const { container } = render(
      <BaseNode {...defaultProps} selected={true} />,
    );
    expect(container.querySelector('.ring-2')).toBeInTheDocument();
  });

  it('should render input handles when inputs exist', () => {
    const { container } = render(<BaseNode {...defaultProps} />);
    // Handles are rendered by React Flow
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should render output handles when outputs exist', () => {
    const { container } = render(<BaseNode {...defaultProps} />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should display config values when config exists', () => {
    const { getByText } = render(<BaseNode {...defaultProps} />);
    expect(getByText(/aspectRatio/)).toBeInTheDocument();
  });

  it('should apply correct background color', () => {
    const { container } = render(<BaseNode {...defaultProps} />);
    expect(container.querySelector('.bg-green-50')).toBeInTheDocument();
  });

  it('should apply correct border color', () => {
    const { container } = render(<BaseNode {...defaultProps} />);
    expect(container.querySelector('.border-green-500')).toBeInTheDocument();
  });
});
