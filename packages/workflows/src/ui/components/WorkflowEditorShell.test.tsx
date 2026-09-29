import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkflowEditorShell } from './WorkflowEditorShell';

const stores = vi.hoisted(() => ({
  showPalette: true,
}));

vi.mock('../stores/uiStore', () => ({
  useUIStore: (selector?: (state: { showPalette: boolean }) => unknown) => {
    const state = { showPalette: stores.showPalette };
    return selector ? selector(state) : state;
  },
}));

vi.mock('../panels/NodePalette', () => ({
  NodePalette: () => <div>Shared Node Palette</div>,
}));

vi.mock('../canvas/WorkflowCanvas', () => ({
  WorkflowCanvas: () => <div>Shared Workflow Canvas</div>,
}));

vi.mock('../toolbar/BottomBar', () => ({
  BottomBar: () => <div>Shared Bottom Bar</div>,
}));

vi.mock('./SmallGraphViewportGuard', () => ({
  SmallGraphViewportGuard: () => <div>Shared Viewport Guard</div>,
}));

describe('WorkflowEditorShell', () => {
  beforeEach(() => {
    stores.showPalette = true;
  });

  it('respects palette visibility from the shared UI store', () => {
    stores.showPalette = false;

    render(<WorkflowEditorShell toolbar={<div>Toolbar Slot</div>} />);

    const palette = screen.getByText('Shared Node Palette').parentElement;
    expect(palette?.className).toContain('w-0');
    expect(palette?.className).toContain('opacity-0');
    expect(screen.getByText('Shared Workflow Canvas')).toBeTruthy();
  });
});
