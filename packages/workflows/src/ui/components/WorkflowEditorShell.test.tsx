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

  it('renders the shared editor layout around injected app content', () => {
    render(
      <WorkflowEditorShell
        modalContent={<div>Modal Host</div>}
        rightPanel={<div>Right Panel</div>}
        toolbar={<div>Toolbar Slot</div>}
      />,
    );

    expect(screen.getByText('Toolbar Slot')).toBeTruthy();
    expect(screen.getByText('Shared Node Palette')).toBeTruthy();
    expect(screen.getByText('Shared Workflow Canvas')).toBeTruthy();
    expect(screen.getByText('Shared Bottom Bar')).toBeTruthy();
    expect(screen.getByText('Shared Viewport Guard')).toBeTruthy();
    expect(screen.getByText('Right Panel')).toBeTruthy();
    expect(screen.getByText('Modal Host')).toBeTruthy();
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
