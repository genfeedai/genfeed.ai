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

vi.mock('@shipshitdev/ui/primitives', () => ({
  DropdownMenu: ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuContent: ({
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
  DropdownMenuItem: ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuSeparator: () => null,
  DropdownMenuSub: ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuSubContent: ({
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
  DropdownMenuSubTrigger: ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuTrigger: ({ children }: { children?: ReactNode }) => (
    <>{children}</>
  ),
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
