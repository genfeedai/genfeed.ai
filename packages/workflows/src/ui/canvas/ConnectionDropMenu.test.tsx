import { getActionDefinition } from '@genfeedai/actions';
import type { WorkflowNode } from '@genfeedai/contracts/types';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useUIStore } from '../stores/uiStore';
import { useWorkflowStore } from '../stores/workflow';
import { ConnectionDropMenu } from './ConnectionDropMenu';

vi.mock('@xyflow/react', async (importOriginal) => {
  const original = await importOriginal<typeof import('@xyflow/react')>();
  return {
    ...original,
    useReactFlow: () => ({
      screenToFlowPosition: (position: { x: number; y: number }) => position,
    }),
  };
});

vi.mock('@genfeedai/ui/primitives/button', () => ({
  Button: ({
    children,
    withWrapper: _withWrapper,
    variant: _variant,
    size: _size,
    ...props
  }: ComponentProps<'button'> & {
    withWrapper?: boolean;
    variant?: string;
    size?: string;
  }) => <button {...props}>{children}</button>,
}));

vi.mock('@genfeedai/ui/primitives/searchbar', () => ({
  default: ({
    ariaLabel,
    onChange,
    value,
  }: {
    ariaLabel: string;
    onChange: ComponentProps<'input'>['onChange'];
    value: string;
  }) => <input aria-label={ariaLabel} onChange={onChange} value={value} />,
}));

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  useWorkflowStore.setState({
    edges: [],
    nodes: [
      {
        data: {
          actionId: 'remotion.composition.render',
          label: 'Render',
          status: 'idle',
        },
        id: 'render',
        position: { x: 0, y: 0 },
        type: 'genfeedAction',
      } as WorkflowNode,
    ],
  });
  useUIStore.getState().openConnectionDropMenu({
    position: { x: 100, y: 100 },
    screenPosition: { x: 100, y: 100 },
    sourceHandleId: 'id',
    sourceHandleType: 'text',
    sourceNodeId: 'render',
  });
});

afterEach(() => {
  cleanup();
  useUIStore.getState().closeConnectionDropMenu();
});

describe('connection drop menu', () => {
  it('creates the selected current action as a rendered action node and connects its real input', () => {
    const action = getActionDefinition('remotion.composition.status');
    expect(action).toBeDefined();
    render(<ConnectionDropMenu />);
    fireEvent.change(
      screen.getByRole('textbox', { name: 'Search compatible nodes' }),
      { target: { value: action?.label } },
    );
    fireEvent.click(screen.getByRole('button', { name: action?.label }));
    const added = useWorkflowStore
      .getState()
      .nodes.find((node) => node.id !== 'render');
    expect(added).toMatchObject({
      type: 'genfeedAction',
      data: { actionId: action?.id },
    });
    expect(useWorkflowStore.getState().edges).toEqual([
      expect.objectContaining({
        source: 'render',
        sourceHandle: 'id',
        target: added?.id,
        targetHandle: 'projectId',
      }),
    ]);
    expect(useUIStore.getState().connectionDropMenu).toBeNull();
  });

  it('filters incompatible actions instead of offering unavailable core node types', () => {
    useUIStore.setState((state) => ({
      connectionDropMenu: state.connectionDropMenu
        ? { ...state.connectionDropMenu, sourceHandleType: 'number' }
        : null,
    }));
    render(<ConnectionDropMenu />);
    const action = getActionDefinition('remotion.composition.status');
    expect(screen.queryByRole('button', { name: action?.label })).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Genfeed Action', exact: true }),
    ).toBeNull();
  });
});
