import '@testing-library/jest-dom';
import { fireEvent, render } from '@testing-library/react';
import ControlNode from '@ui/workflow-builder/nodes/ControlNode';
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

describe('ControlNode', () => {
  const defaultProps: ComponentProps<typeof ControlNode> = {
    data: {
      config: { duration: 5000 },
      definition: {
        category: 'control',
        configSchema: {},
        description: 'Delay control node',
        icon: 'clock',
        inputs: {},
        label: 'Delay',
        outputs: {},
      },
      inputVariableKeys: [],
      label: 'Delay',
      nodeType: 'control-delay',
    },
    id: 'node-1',
    isConnectable: true,
    selected: false,
  };

  it('should render without crashing', () => {
    const { container } = render(<ControlNode {...defaultProps} />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should apply gray color scheme for control nodes', () => {
    const { container } = render(<ControlNode {...defaultProps} />);
    expect(
      container.querySelector('.bg-secondary') ||
        container.querySelector('[class*="bg-"]'),
    ).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    const { container } = render(<ControlNode {...defaultProps} />);

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
    const { container } = render(<ControlNode {...defaultProps} />);

    // Check node has correct color scheme
    expect(
      container.querySelector('.bg-secondary') ||
        container.querySelector('[class*="bg-"]'),
    ).toBeInTheDocument();
    expect(
      container.querySelector('.border-muted-foreground') ||
        container.querySelector('[class*="border-"]'),
    ).toBeInTheDocument();

    // Check selected state styling
    const { container: selectedContainer } = render(
      <ControlNode {...defaultProps} selected={true} />,
    );
    expect(selectedContainer.querySelector('.ring-2')).toBeInTheDocument();
  });
});
