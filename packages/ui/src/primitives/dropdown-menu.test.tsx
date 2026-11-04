// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import type * as DropdownPrimitive from '@radix-ui/react-dropdown-menu';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  type ComponentProps,
  type ReactNode,
  useEffect,
  useState,
} from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSubContent,
} from './dropdown-menu';
import { overlayMenuSurfaceClassName } from './field-control';

// Model the upstream focus-outside misclassification: focus inside a
// portaled submenu can reach its outside callback before pointer selection.
function SubContentFocusBoundary({
  children,
  className,
  onFocusOutside,
  onPointerDownOutside: _onPointerDownOutside,
  sideOffset: _sideOffset,
  ...props
}: ComponentProps<typeof DropdownPrimitive.SubContent>) {
  const [open, setOpen] = useState(true);
  useEffect(() => {
    const onFocus = (originalEvent: FocusEvent) => {
      const outside = new CustomEvent('dismissableLayer.focusOutside', {
        cancelable: true,
        detail: { originalEvent },
      });
      originalEvent.target?.dispatchEvent(outside);
      onFocusOutside?.(outside);
      if (!outside.defaultPrevented) setOpen(false);
    };
    document.addEventListener('focusin', onFocus);
    return () => document.removeEventListener('focusin', onFocus);
  }, [onFocusOutside]);
  return open ? (
    <div
      {...props}
      data-testid="dropdown-menu-sub-content"
      className={className}
    >
      {children}
    </div>
  ) : null;
}

function SubmenuSelection() {
  const [selected, setSelected] = useState('Unread');
  return (
    <>
      <span>Selected {selected}</span>
      <DropdownMenu>
        <DropdownMenuSubContent>
          <button type="button" onClick={() => setSelected('Recent')}>
            Recent
          </button>
        </DropdownMenuSubContent>
      </DropdownMenu>
      <button type="button">Outside menu</button>
    </>
  );
}

vi.mock('@radix-ui/react-dropdown-menu', () => ({
  CheckboxItem: ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  ),
  Content: ({
    children,
    className,
  }: {
    children?: ReactNode;
    className?: string;
  }) => (
    <div data-testid="dropdown-menu-content" className={className}>
      {children}
    </div>
  ),
  Group: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Item: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  ItemIndicator: ({ children }: { children?: ReactNode }) => <>{children}</>,
  Label: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Portal: ({ children }: { children?: ReactNode }) => <>{children}</>,
  RadioGroup: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  RadioItem: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Root: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Separator: () => null,
  Sub: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  SubContent: SubContentFocusBoundary,
  SubTrigger: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Trigger: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));

describe('DropdownMenu overlay surface', () => {
  it('paints menu content on the elevated overlay surface', () => {
    render(
      <DropdownMenu>
        <DropdownMenuContent>Actions</DropdownMenuContent>
      </DropdownMenu>,
    );

    const panel = screen.getByTestId('dropdown-menu-content');
    for (const token of overlayMenuSurfaceClassName.split(' ')) {
      expect(panel).toHaveClass(token);
    }
    expect(panel).not.toHaveClass('border');
    expect(panel).not.toHaveClass('border-border');
    expect(panel).not.toHaveClass('bg-card');
  });

  it('paints submenu content on the same elevated surface', () => {
    render(
      <DropdownMenu>
        <DropdownMenuSubContent>More</DropdownMenuSubContent>
      </DropdownMenu>,
    );

    const panel = screen.getByTestId('dropdown-menu-sub-content');
    for (const token of overlayMenuSurfaceClassName.split(' ')) {
      expect(panel).toHaveClass(token);
    }
    expect(panel).not.toHaveClass('border');
    expect(panel).not.toHaveClass('border-border');
  });
});

describe('DropdownMenu submenu focus boundary', () => {
  it('keeps its own focused item mounted until pointer selection completes', async () => {
    const user = userEvent.setup();
    render(<SubmenuSelection />);
    await user.click(screen.getByRole('button', { name: 'Recent' }));
    expect(screen.getByText('Selected Recent')).toBeVisible();
  });

  it('still dismisses when focus moves outside the submenu', async () => {
    const user = userEvent.setup();
    render(<SubmenuSelection />);
    await user.click(screen.getByRole('button', { name: 'Outside menu' }));
    expect(
      screen.queryByRole('button', { name: 'Recent' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Outside menu' })).toHaveFocus();
  });
});
