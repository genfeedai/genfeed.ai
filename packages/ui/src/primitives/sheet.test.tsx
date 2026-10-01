import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@ui/primitives/sheet';
import { describe, expect, it, vi } from 'vitest';

describe('sheet close control', () => {
  it('stays above a sticky header, is keyboard reachable, and dismisses the sheet', () => {
    const onOpenChange = vi.fn();
    render(
      <Sheet open onOpenChange={onOpenChange}>
        <SheetContent aria-describedby={undefined}>
          <SheetHeader className="sticky top-0 z-10">
            <SheetTitle>Asset</SheetTitle>
          </SheetHeader>
        </SheetContent>
      </Sheet>,
    );
    const close = screen.getByRole('button', { name: 'Close' });
    expect(close).toHaveClass('z-20');
    expect(close.tabIndex).toBe(0);
    fireEvent.click(close);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
