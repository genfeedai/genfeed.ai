import '@testing-library/jest-dom/vitest';
import { render } from '@testing-library/react';
import BaseNode from '@ui/workflow-builder/nodes/BaseNode';
import { Image } from 'lucide-react';
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
    icon: <Image />,
    id: 'node-1',
    isConnectable: true,
    selected: false,
  };

  it('should apply correct border color', () => {
    const { container } = render(<BaseNode {...defaultProps} />);
    expect(container.querySelector('.border-green-500')).toBeInTheDocument();
  });
});
