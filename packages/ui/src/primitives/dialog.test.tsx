import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './dialog';

describe('Dialog scrolling', () => {
  it('keeps the header and footer outside the default body scroll region', () => {
    render(
      <Dialog defaultOpen>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Long setup</DialogTitle>
            <DialogDescription>Follow these steps.</DialogDescription>
          </DialogHeader>
          <DialogBody>Setup content</DialogBody>
          <DialogFooter>
            <DialogClose>Finish</DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>,
    );

    const region = screen
      .getByText('Setup content')
      .closest('[data-modal-scroll-region]');
    expect(region).toHaveClass('min-h-0', 'overflow-y-auto');
    expect(screen.getByRole('dialog')).toHaveClass('max-h-[90dvh]');
    expect(region).not.toContainElement(
      screen.getByRole('heading', { name: 'Long setup' }),
    );
    expect(region).not.toContainElement(
      screen.getByRole('button', { name: 'Finish' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('allows an explicit body scroll opt-out for content that owns its scrolling', () => {
    render(
      <Dialog defaultOpen>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Custom pane</DialogTitle>
          </DialogHeader>
          <DialogBody scrollable={false}>Custom scroll pane</DialogBody>
        </DialogContent>
      </Dialog>,
    );
    expect(
      screen
        .getByText('Custom scroll pane')
        .closest('[data-modal-scroll-region]'),
    ).toBeNull();
  });

  it('applies the size preset to the content width', () => {
    render(
      <Dialog defaultOpen>
        <DialogContent size="xl">
          <DialogTitle>Wide</DialogTitle>
        </DialogContent>
      </Dialog>,
    );
    expect(screen.getByRole('dialog')).toHaveClass('max-w-4xl');
  });

  it('docks a right panel to the viewport edge without a size cap', () => {
    render(
      <Dialog defaultOpen>
        <DialogContent placement="right" size="xl">
          <DialogTitle>Inspector</DialogTitle>
        </DialogContent>
      </Dialog>,
    );
    const panel = screen.getByRole('dialog');
    expect(panel).toHaveClass('gen-dialog-panel-right', 'right-0', 'h-full');
    expect(panel).not.toHaveClass('max-w-4xl', 'top-1/2');
  });
});
