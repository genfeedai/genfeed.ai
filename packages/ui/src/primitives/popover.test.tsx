// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { overlayMenuSurfaceClassName } from './field-control';
import { Popover, PopoverContent, PopoverPanelContent } from './popover';

vi.mock('@radix-ui/react-popover', () => ({
  Anchor: ({ children }: { children?: ReactNode }) => <>{children}</>,
  Content: ({
    children,
    className,
  }: {
    children?: ReactNode;
    className?: string;
  }) => (
    <div data-testid="popover-content" className={className}>
      {children}
    </div>
  ),
  Portal: ({ children }: { children?: ReactNode }) => <>{children}</>,
  Root: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Trigger: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));

describe('Popover overlay surface', () => {
  it('paints PopoverContent on the elevated dropdown surface', () => {
    render(
      <Popover>
        <PopoverContent>Panel</PopoverContent>
      </Popover>,
    );

    const panel = screen.getByTestId('popover-content');
    for (const token of overlayMenuSurfaceClassName.split(' ')) {
      expect(panel).toHaveClass(token);
    }
    expect(panel).not.toHaveClass('bg-card');
    expect(panel).not.toHaveClass('gen-shell-panel');
  });

  it('paints PopoverPanelContent on the same elevated surface', () => {
    render(
      <Popover>
        <PopoverPanelContent>Panel</PopoverPanelContent>
      </Popover>,
    );

    const panel = screen.getByTestId('popover-content');
    for (const token of overlayMenuSurfaceClassName.split(' ')) {
      expect(panel).toHaveClass(token);
    }
  });
});
