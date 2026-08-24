// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSubContent,
} from './dropdown-menu';
import { overlayMenuSurfaceClassName } from './field-control';

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
  SubContent: ({
    children,
    className,
  }: {
    children?: ReactNode;
    className?: string;
  }) => (
    <div data-testid="dropdown-menu-sub-content" className={className}>
      {children}
    </div>
  ),
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
  });
});
