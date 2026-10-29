import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WorkflowEditorShell } from './WorkflowEditorShell';

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
  it('renders the shared editor layout around injected app content', () => {
    render(
      <WorkflowEditorShell
        modalContent={<div>Modal Host</div>}
        rightPanel={<div>Right Panel</div>}
        toolbar={<div>Toolbar Slot</div>}
      />,
    );

    expect(screen.getByText('Toolbar Slot')).toBeTruthy();
    expect(screen.getByText('Shared Workflow Canvas')).toBeTruthy();
    expect(screen.getByText('Shared Bottom Bar')).toBeTruthy();
    expect(screen.getByText('Shared Viewport Guard')).toBeTruthy();
    expect(screen.getByText('Right Panel')).toBeTruthy();
    expect(screen.getByText('Modal Host')).toBeTruthy();
  });

  it('uses the host page main landmark without nesting another', () => {
    render(
      <main>
        <WorkflowEditorShell />
      </main>,
    );

    expect(screen.getAllByRole('main')).toHaveLength(1);
    expect(screen.getByText('Shared Workflow Canvas')).toBeTruthy();
  });

  it('renders the canvas without a stacked toolbar slot', () => {
    render(<WorkflowEditorShell />);

    expect(screen.queryByText('Toolbar Slot')).toBeNull();
    expect(screen.getByText('Shared Workflow Canvas')).toBeTruthy();
  });
});
