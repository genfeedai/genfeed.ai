import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const stores = vi.hoisted(() => ({
  useUIStore: vi.fn(),
}));

vi.mock('../canvas/WorkflowCanvas', () => ({
  WorkflowCanvas: () => <div data-testid="workflow-canvas" />,
}));

vi.mock('../panels/NodePalette', () => ({
  NodePalette: () => <div data-testid="node-palette" />,
}));

vi.mock('../toolbar/BottomBar', () => ({
  BottomBar: () => <div data-testid="bottom-bar" />,
}));

vi.mock('./SmallGraphViewportGuard', () => ({
  SmallGraphViewportGuard: () => null,
}));

vi.mock('../stores/uiStore', () => ({
  useUIStore: stores.useUIStore,
}));

describe('WorkflowEditorShell runtime smoke test', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stores.useUIStore.mockImplementation(
      (selector?: (state: { showPalette: boolean }) => unknown) => {
        const state = { showPalette: true };
        return selector ? selector(state) : state;
      },
    );
  });

  it('renders without throwing when the canvas subtree is stubbed', async () => {
    const { WorkflowEditorShell } = await import('./WorkflowEditorShell');

    render(<WorkflowEditorShell toolbar={<div data-testid="toolbar" />} />);

    expect(screen.getByTestId('toolbar')).toBeTruthy();
    expect(screen.getByTestId('node-palette')).toBeTruthy();
    expect(screen.getByTestId('workflow-canvas')).toBeTruthy();
    expect(screen.getByTestId('bottom-bar')).toBeTruthy();
  });
});
