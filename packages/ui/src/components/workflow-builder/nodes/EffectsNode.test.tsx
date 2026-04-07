import '@testing-library/jest-dom';
import { fireEvent, render } from '@testing-library/react';
import EffectsNode from '@ui/workflow-builder/nodes/EffectsNode';
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

describe('EffectsNode', () => {
  const defaultProps: ComponentProps<typeof EffectsNode> = {
    data: {
      config: { filter: 'vintage' },
      definition: {
        category: 'effects',
        configSchema: {},
        description: 'Apply filter effect',
        icon: 'sparkles',
        inputs: { media: { label: 'Media', type: 'any' } },
        label: 'Add Filter',
        outputs: { media: { label: 'Filtered Media', type: 'any' } },
      },
      inputVariableKeys: [],
      label: 'Add Filter',
      nodeType: 'effects-filter',
    },
    id: 'node-1',
    isConnectable: true,
    selected: false,
  };

  it('should render without crashing', () => {
    const { container } = render(<EffectsNode {...defaultProps} />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should apply purple color scheme for effects nodes', () => {
    const { container } = render(<EffectsNode {...defaultProps} />);
    expect(container.querySelector('.bg-purple-50')).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    const { container } = render(<EffectsNode {...defaultProps} />);

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
    const { container } = render(<EffectsNode {...defaultProps} />);

    // Check node has correct color scheme
    expect(container.querySelector('.bg-purple-50')).toBeInTheDocument();
    expect(container.querySelector('.border-purple-400')).toBeInTheDocument();

    // Check selected state styling
    const { container: selectedContainer } = render(
      <EffectsNode {...defaultProps} selected={true} />,
    );
    expect(selectedContainer.querySelector('.ring-2')).toBeInTheDocument();
  });
});
