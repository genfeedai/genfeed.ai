import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from './context-menu';

class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
globalThis.ResizeObserver = ResizeObserverStub;

function Harness() {
  return (
    <ContextMenu>
      <ContextMenuTrigger>
        <div>Canvas</div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem>
          Copy <ContextMenuShortcut>⌘C</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem isDestructive>Delete</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

describe('ContextMenu', () => {
  it('opens a menu of items on right-click', () => {
    render(<Harness />);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();

    fireEvent.contextMenu(screen.getByText('Canvas'));

    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(screen.getAllByRole('menuitem')).toHaveLength(2);
    expect(screen.getByRole('menuitem', { name: /Copy/ })).toHaveTextContent(
      '⌘C',
    );
  });

  it('closes on Escape', () => {
    render(<Harness />);
    fireEvent.contextMenu(screen.getByText('Canvas'));

    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('colours a destructive item', () => {
    render(<Harness />);
    fireEvent.contextMenu(screen.getByText('Canvas'));

    expect(screen.getByRole('menuitem', { name: 'Delete' })).toHaveClass(
      'text-destructive',
    );
  });
});
