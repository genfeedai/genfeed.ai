import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../canvas/WorkflowCanvas', () => ({
  WorkflowCanvas: () => <div data-testid="workflow-canvas" />,
}));

vi.mock('../toolbar/BottomBar', () => ({
  BottomBar: () => <div data-testid="bottom-bar" />,
}));

vi.mock('./SmallGraphViewportGuard', () => ({
  SmallGraphViewportGuard: () => null,
}));

describe('WorkflowEditorShell runtime smoke test', () => {
  it('renders without throwing when the canvas subtree is stubbed', async () => {
    const { WorkflowEditorShell } = await import('./WorkflowEditorShell');

    render(<WorkflowEditorShell toolbar={<div data-testid="toolbar" />} />);

    expect(screen.getByTestId('toolbar')).toBeTruthy();
    expect(screen.getByTestId('workflow-canvas')).toBeTruthy();
    expect(screen.getByTestId('bottom-bar')).toBeTruthy();
  });
});
