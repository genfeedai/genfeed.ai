import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import ContextInspector from '@ui/overlays/context-inspector/ContextInspector';
import type { PropsWithChildren } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@ui/primitives/sheet', () => ({
  Sheet: ({
    children,
    onOpenChange,
    open,
  }: PropsWithChildren<{
    onOpenChange: (open: boolean) => void;
    open: boolean;
  }>) =>
    open ? (
      <div>
        {children}
        <button type="button" onClick={() => onOpenChange(false)}>
          Dismiss inspector
        </button>
      </div>
    ) : null,
  SheetContent: ({
    children,
    className,
    'aria-describedby': ariaDescribedBy,
  }: PropsWithChildren<{
    'aria-describedby'?: string;
    className?: string;
  }>) => (
    <div
      aria-describedby={ariaDescribedBy}
      className={className}
      data-testid="inspector-content"
      role="dialog"
    >
      {children}
    </div>
  ),
  SheetDescription: ({ children, id }: PropsWithChildren<{ id?: string }>) => (
    <p id={id}>{children}</p>
  ),
  SheetHeader: ({ children }: PropsWithChildren) => <div>{children}</div>,
  SheetTitle: ({ children }: PropsWithChildren) => <h2>{children}</h2>,
}));

describe('ContextInspector', () => {
  it('renders a labelled right-side inspection surface with shared regions', () => {
    const onOpenChange = vi.fn();

    render(
      <ContextInspector
        bodyClassName="custom-body"
        description="Inspect the selected context"
        footer={<div>Inspector footer</div>}
        headerAction={<button type="button">Header action</button>}
        isOpen
        onOpenChange={onOpenChange}
        title="Context details"
        width="lg"
      >
        <div>Inspector body</div>
      </ContextInspector>,
    );

    const content = screen.getByTestId('inspector-content');
    const description = screen.getByText('Inspect the selected context');

    expect(content).toHaveClass('sm:max-w-[min(48rem,92vw)]');
    expect(content).toHaveAttribute('aria-describedby', description.id);
    expect(
      screen.getByRole('heading', { name: 'Context details' }),
    ).toBeVisible();
    expect(screen.getByText('Inspector body').parentElement).toHaveClass(
      'custom-body',
    );
    expect(screen.getByText('Inspector footer')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Header action' })).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss inspector' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('does not mount inspector content while closed', () => {
    render(
      <ContextInspector
        isOpen={false}
        onOpenChange={vi.fn()}
        title="Closed context"
      >
        Closed body
      </ContextInspector>,
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
