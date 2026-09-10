import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { GenfeedActionNode } from './GenfeedActionNode';

vi.mock('@xyflow/react', () => ({
  Handle: () => <div />,
  NodeResizer: ({
    minHeight,
    minWidth,
  }: {
    minHeight: number;
    minWidth: number;
  }) => (
    <div
      data-min-height={minHeight}
      data-min-width={minWidth}
      data-testid="node-resizer"
    />
  ),
  Position: { Left: 'left', Right: 'right' },
  useUpdateNodeInternals: () => vi.fn(),
}));

vi.mock('../../stores/uiStore', () => ({
  useUIStore: (selector: (state: object) => unknown) =>
    selector({
      highlightedNodeIds: [],
      selectedNodeId: null,
      selectNode: vi.fn(),
    }),
}));

vi.mock('../../stores/workflow', () => ({
  useWorkflowStore: (selector: (state: object) => unknown) =>
    selector({
      isNodeLocked: () => false,
      toggleNodeLock: vi.fn(),
      updateNodeData: vi.fn(),
    }),
}));

vi.mock('../../stores/execution', () => ({
  useExecutionStore: (selector: (state: object) => unknown) =>
    selector({
      activeNodeExecutions: new Set(),
      executeNode: vi.fn(),
      isRunning: false,
      stopExecution: vi.fn(),
      stopNodeExecution: vi.fn(),
    }),
}));

vi.mock('../NodeErrorBoundary', () => ({
  NodeErrorBoundary: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('../PreviewTooltip', () => ({
  PreviewTooltip: () => null,
}));

vi.mock('@genfeedai/actions', () => ({
  getActionDefinition: () => ({
    description: 'Posts for context.',
    id: 'socialRead',
    inputSchema: {
      properties: {
        brandId: { type: 'string' },
        credentialId: { type: 'string' },
        platform: { type: 'string' },
        query: { type: 'string' },
        username: { type: 'string' },
      },
      type: 'object',
    },
    label: 'Social',
    outputSchema: { properties: { posts: { type: 'string' } }, type: 'object' },
    visibility: 'workflow',
    workflowCategory: 'input',
    workflowIcon: 'Search',
  }),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: { count?: number }) => {
    if (key === 'moreValues') return `+${values?.count} more values`;
    return key;
  },
}));

describe('GenfeedActionNode', () => {
  it('renders primary inputs on the node and keeps a usable minimum size', () => {
    render(
      <GenfeedActionNode
        data={{ actionId: 'socialRead', parameters: { query: 'genfeed' } }}
        id="node-1"
        selected={false}
        type="genfeedAction"
        {...({} as object)}
      />,
    );

    expect(screen.getByLabelText('Query')).toHaveValue('genfeed');
    expect(screen.getByLabelText('Username')).toBeTruthy();
    expect(screen.getByLabelText('Platform')).toBeTruthy();
    expect(screen.queryByLabelText('Brand Id')).toBeNull();
    expect(screen.getByTestId('node-resizer')).toHaveAttribute(
      'data-min-width',
      '300',
    );
    expect(screen.getByTestId('node-resizer')).toHaveAttribute(
      'data-min-height',
      '220',
    );
  });
});
