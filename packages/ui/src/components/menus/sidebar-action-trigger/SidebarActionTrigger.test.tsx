import { render, screen } from '@testing-library/react';
import { HiPlus } from 'react-icons/hi2';
import { describe, expect, it, vi } from 'vitest';
import SidebarActionTrigger from './SidebarActionTrigger';

describe('SidebarActionTrigger', () => {
  it('renders a menu-style action with a hover-only shortcut badge', () => {
    render(
      <SidebarActionTrigger
        icon={<HiPlus className="h-4 w-4" />}
        label="New Task"
        onClick={vi.fn()}
        shortcut="⌘⇧N"
      />,
    );

    expect(
      screen.getByRole('button', { name: 'New Task' }),
    ).toBeInTheDocument();
    expect(screen.getByText('⌘⇧N')).toHaveClass('opacity-0');
    expect(screen.getByText('New Task')).toHaveClass('flex-1');
  });
});
