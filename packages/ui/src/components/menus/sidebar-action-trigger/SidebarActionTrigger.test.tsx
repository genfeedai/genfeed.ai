import { render, screen } from '@testing-library/react';
import { Plus } from 'lucide-react';

import { describe, expect, it, vi } from 'vitest';
import SidebarActionTrigger from './SidebarActionTrigger';

describe('SidebarActionTrigger', () => {
  it('keeps the shortcut badge visible without hover', () => {
    render(
      <SidebarActionTrigger
        icon={<Plus className="size-4" />}
        label="New Task"
        onClick={vi.fn()}
        shortcut="⌘⇧N"
      />,
    );

    const button = screen.getByRole('button', { name: 'New Task' });

    expect(button).toBeInTheDocument();
    expect(screen.getByText('⌘⇧N')).toHaveClass(
      'opacity-100',
      '[@media(hover:hover)]:opacity-0',
      '[@media(hover:hover)]:group-hover:opacity-100',
      '[@media(hover:hover)]:group-focus-within:opacity-100',
    );
    expect(screen.getByText('⌘⇧N')).not.toHaveClass('opacity-0');
    expect(screen.getByText('New Task')).toHaveClass('min-w-0', 'flex-1');
    expect(button).toHaveClass(
      'h-control-sm',
      'gap-2',
      'px-2.5',
      'py-1',
      'rounded',
      'hover:bg-foreground/[0.06]',
      'focus-visible:ring-offset-background',
    );
    expect(button.firstElementChild).toHaveClass('size-4');
    expect(button.firstElementChild).not.toHaveClass('size-5');
  });
});
