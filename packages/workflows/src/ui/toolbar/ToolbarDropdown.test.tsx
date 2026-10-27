import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ToolbarDropdown } from './ToolbarDropdown';

describe('ToolbarDropdown', () => {
  function renderDropdown(
    onClick = vi.fn(),
    extra: Partial<{ disabled: boolean }> = {},
  ) {
    render(
      <ToolbarDropdown
        items={[
          {
            icon: <span />,
            id: 'first',
            label: 'First Action',
            onClick,
            ...extra,
          },
          { id: 'sep', separator: true },
          {
            external: true,
            icon: <span />,
            id: 'docs',
            label: 'Docs',
            onClick: vi.fn(),
          },
        ]}
        label="File"
      />,
    );
    return { onClick };
  }

  function openMenu() {
    fireEvent.keyDown(screen.getByRole('button', { name: /File/ }), {
      key: 'Enter',
    });
  }

  it('opens from the trigger and lists items', () => {
    renderDropdown();
    expect(screen.queryByText('First Action')).not.toBeInTheDocument();

    openMenu();
    expect(screen.getByText('First Action')).toBeInTheDocument();
    expect(screen.getByText('Docs')).toBeInTheDocument();
    expect(screen.getByText('↗')).toBeInTheDocument();
  });

  it('invokes the item action and closes', () => {
    const { onClick } = renderDropdown();
    openMenu();
    fireEvent.click(screen.getByText('First Action'));

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('First Action')).not.toBeInTheDocument();
  });

  it('ignores clicks on disabled items', () => {
    const { onClick } = renderDropdown(vi.fn(), { disabled: true });
    openMenu();
    fireEvent.click(screen.getByText('First Action'));

    expect(onClick).not.toHaveBeenCalled();
  });

  it('closes on Escape', () => {
    renderDropdown();
    openMenu();
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });

    expect(screen.queryByText('First Action')).not.toBeInTheDocument();
  });
});
