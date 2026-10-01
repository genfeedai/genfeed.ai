import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import QuickActionsMenu from '@ui/quick-actions/menu/QuickActionsMenu';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@ui/tests/next-intl.stub');
  return {
    useTranslations: (namespace: string) => translateFromCatalog(namespace),
  };
});

describe('QuickActionsMenu', () => {
  const actions = [
    {
      id: 'trim',
      label: 'Trim Video',
      onClick: vi.fn(),
      sectionLabel: 'Transform',
    },
    {
      dividerBefore: true,
      id: 'delete',
      label: 'Delete',
      onClick: vi.fn(),
      sectionLabel: 'Danger',
      variant: 'error' as const,
    },
  ];

  it('renders the overflow trigger', () => {
    render(
      <QuickActionsMenu
        actions={actions}
        isMenuOpen={false}
        setIsMenuOpen={vi.fn()}
        onActionClick={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('More')).toBeInTheDocument();
  });

  it('uses a quiet hover fill instead of a white focus ring', () => {
    render(
      <QuickActionsMenu
        actions={actions}
        isMenuOpen={false}
        setIsMenuOpen={vi.fn()}
        onActionClick={vi.fn()}
      />,
    );

    const trigger = screen.getByRole('button', { name: 'More' });
    expect(trigger.className).toContain('focus-visible:bg-hover');
    expect(trigger.className).not.toContain('ring-ring');
    expect(trigger.className).toContain('h-8');
  });

  it('lets a compact trigger replace the default padded size', () => {
    render(
      <QuickActionsMenu
        actions={actions}
        isMenuOpen={false}
        setIsMenuOpen={vi.fn()}
        onActionClick={vi.fn()}
        triggerClassName="size-7 p-0"
      />,
    );

    const trigger = screen.getByRole('button', { name: 'More' });
    expect(trigger).toHaveClass('size-7', 'p-0');
    expect(trigger.className.split(/\s+/)).not.toContain('h-8');
    expect(trigger.className).not.toContain('ring-ring');
  });

  it('renders section headings as submenus without exposing their actions at the root', async () => {
    render(
      <QuickActionsMenu
        actions={actions}
        isMenuOpen={true}
        setIsMenuOpen={vi.fn()}
        onActionClick={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('menu')).toBeInTheDocument();
      expect(screen.getByText('Transform')).toBeInTheDocument();
      expect(screen.getByText('Danger')).toBeInTheDocument();
      expect(screen.queryByText('Trim Video')).not.toBeInTheDocument();
      expect(screen.queryByText('Delete')).not.toBeInTheDocument();
    });

    const menu = screen.getByTestId('quick-actions-menu');
    expect(menu).toHaveClass('min-w-40');

    const menuItems = screen.getAllByRole('menuitem');
    expect(menuItems).toHaveLength(actions.length);
  });

  it('forwards clicks from a menu action', async () => {
    const onActionClick = vi.fn();

    render(
      <QuickActionsMenu
        actions={actions}
        isMenuOpen={true}
        setIsMenuOpen={vi.fn()}
        onActionClick={onActionClick}
      />,
    );

    fireEvent.keyDown(screen.getByRole('menuitem', { name: 'Transform' }), {
      key: 'ArrowRight',
    });
    await waitFor(() => {
      expect(screen.getByText('Trim Video')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Trim Video'));

    expect(onActionClick).toHaveBeenCalledWith(actions[0]);
  });
  it('supports a second submenu level and preserves the selected action', async () => {
    const onActionClick = vi.fn();
    const reframe = {
      id: 'portrait',
      label: 'Reframe to Portrait',
      sectionLabel: 'Transform',
      onClick: vi.fn(),
    };
    render(
      <QuickActionsMenu
        actions={[reframe]}
        isMenuOpen={true}
        setIsMenuOpen={vi.fn()}
        onActionClick={onActionClick}
      />,
    );
    fireEvent.keyDown(screen.getByRole('menuitem', { name: 'Transform' }), {
      key: 'ArrowRight',
    });
    await waitFor(() =>
      expect(
        screen.getByRole('menuitem', { name: 'Reframe', exact: true }),
      ).toBeInTheDocument(),
    );
    fireEvent.keyDown(
      screen.getByRole('menuitem', { name: 'Reframe', exact: true }),
      { key: 'ArrowRight' },
    );
    await waitFor(() =>
      expect(screen.getByText('Reframe to Portrait')).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByText('Reframe to Portrait'));
    expect(onActionClick).toHaveBeenCalledWith(reframe);
  });
});
