import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
} from '@genfeedai/ui/primitives/context-menu';
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { ContextMenuItems } from './ContextMenuItems';
import type { ContextMenuItemConfig } from './context-menu-config';

class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
globalThis.ResizeObserver = ResizeObserverStub;

function Harness({
  items,
}: {
  items: (onPick: (id: string) => void) => ContextMenuItemConfig[];
}) {
  const [picked, setPicked] = useState('none');

  return (
    <>
      <output aria-label="Picked">{picked}</output>
      <ContextMenu>
        <ContextMenuTrigger>
          <div>Canvas</div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItems items={items(setPicked)} />
        </ContextMenuContent>
      </ContextMenu>
    </>
  );
}

describe('ContextMenuItems', () => {
  it('lists the described items and runs the chosen one', () => {
    render(
      <Harness
        items={(onPick) => [
          {
            id: 'copy',
            label: 'Copy',
            onClick: () => onPick('copy'),
            shortcut: '⌘C',
          },
          { id: 'sep', separator: true },
          {
            danger: true,
            id: 'delete',
            label: 'Delete',
            onClick: () => onPick('delete'),
          },
          {
            disabled: true,
            id: 'group',
            label: 'Group',
            onClick: () => onPick('group'),
          },
        ]}
      />,
    );

    fireEvent.contextMenu(screen.getByText('Canvas'));

    expect(
      screen.getAllByRole('menuitem').map((item) => item.textContent),
    ).toEqual(['Copy⌘C', 'Delete', 'Group']);
    expect(screen.getByRole('menuitem', { name: 'Delete' })).toHaveClass(
      'text-destructive',
    );
    expect(screen.getByRole('menuitem', { name: 'Group' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );

    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));

    expect(screen.getByLabelText('Picked')).toHaveTextContent('delete');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('shows a submenu entry that opens its own items', () => {
    render(
      <Harness
        items={(onPick) => [
          {
            id: 'color',
            label: 'Color',
            submenu: [
              { id: 'red', label: 'Red', onClick: () => onPick('red') },
            ],
          },
        ]}
      />,
    );

    fireEvent.contextMenu(screen.getByText('Canvas'));
    const trigger = screen.getByRole('menuitem', { name: 'Color' });
    fireEvent.keyDown(trigger, { key: 'ArrowRight' });

    expect(screen.getByRole('menuitem', { name: 'Red' })).toBeInTheDocument();
  });
});
