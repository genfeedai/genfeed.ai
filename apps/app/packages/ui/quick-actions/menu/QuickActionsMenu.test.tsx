import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import QuickActionsMenu from '@ui/quick-actions/menu/QuickActionsMenu';
import { describe, expect, it, vi } from 'vitest';

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

  it('renders grouped section labels inside the open menu', async () => {
    render(
      <QuickActionsMenu
        actions={actions}
        isMenuOpen={true}
        setIsMenuOpen={vi.fn()}
        onActionClick={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Transform')).toBeInTheDocument();
      expect(screen.getByText('Danger')).toBeInTheDocument();
      expect(screen.getByText('Trim Video')).toBeInTheDocument();
      expect(screen.getByText('Delete')).toBeInTheDocument();
    });
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

    await waitFor(() => {
      expect(screen.getByText('Trim Video')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Trim Video'));

    expect(onActionClick).toHaveBeenCalledWith(actions[0]);
  });
});
