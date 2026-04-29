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

    const button = screen.getByRole('button', { name: 'New Task' });

    expect(button).toBeInTheDocument();
    expect(screen.getByText('⌘⇧N')).toHaveClass('opacity-0');
    expect(screen.getByText('New Task')).toHaveClass('min-w-0', 'flex-1');
    expect(button).toHaveClass(
      'rounded',
      'hover:bg-white/[0.035]',
      'focus-visible:ring-offset-background',
    );
  });
});
