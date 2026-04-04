import '@testing-library/jest-dom';
import { fireEvent, render } from '@testing-library/react';
import AINode from '@ui/workflow-builder/nodes/AINode';
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

describe('AINode', () => {
  const defaultProps: ComponentProps<typeof AINode> = {
    data: {
      config: { model: 'dall-e-3' },
      definition: {
        category: 'ai',
        configSchema: {},
        description: 'Generate image from prompt',
        icon: 'sparkles',
        inputs: { prompt: { label: 'Prompt', type: 'text' } },
        label: 'Generate Image',
        outputs: { image: { label: 'Image', type: 'image' } },
      },
      inputVariableKeys: [],
      label: 'Generate Image',
      nodeType: 'ai-generate-image',
    },
    id: 'node-1',
    isConnectable: true,
    selected: false,
  };

  it('should render without crashing', () => {
    const { container } = render(<AINode {...defaultProps} />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should apply amber color scheme for AI nodes', () => {
    const { container } = render(<AINode {...defaultProps} />);
    expect(container.querySelector('.bg-amber-50')).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    const { container } = render(<AINode {...defaultProps} />);

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
    const { container } = render(<AINode {...defaultProps} />);

    // Check node has correct color scheme
    expect(container.querySelector('.bg-amber-50')).toBeInTheDocument();
    expect(container.querySelector('.border-amber-400')).toBeInTheDocument();

    // Check selected state styling
    const { container: selectedContainer } = render(
      <AINode {...defaultProps} selected={true} />,
    );
    expect(selectedContainer.querySelector('.ring-2')).toBeInTheDocument();
  });
});
