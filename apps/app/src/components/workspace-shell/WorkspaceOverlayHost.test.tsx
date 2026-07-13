import { fireEvent, render, screen } from '@testing-library/react';
import type { FocusEvent, FocusEventHandler, ReactNode } from 'react';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { getWorkspaceShellOverlayRegistration } from '@/lib/workspace-shell/workspace-shell-registry';

vi.mock('@/features/library-remix/LibraryPickerOverlay', () => ({
  default: ({
    onSelect,
    threadId,
  }: {
    onSelect: (reference: {
      brandId: string;
      kind: 'ingredient';
      organizationId: string;
      recordId: string;
      serializer: 'ingredient';
    }) => void;
    threadId?: string | null;
  }) => (
    <button
      type="button"
      onClick={() =>
        onSelect({
          brandId: 'brand-1',
          kind: 'ingredient',
          organizationId: 'org-1',
          recordId: 'ingredient-1',
          serializer: 'ingredient',
        })
      }
    >
      Select Library source for {threadId}
    </button>
  ),
}));

vi.mock('@ui/primitives/dialog', () => ({
  Dialog: ({
    children,
    onOpenChange,
    open,
  }: {
    children: ReactNode;
    onOpenChange: (isOpen: boolean) => void;
    open: boolean;
  }) =>
    open ? (
      <div role="dialog">
        {children}
        <button type="button" onClick={() => onOpenChange(false)}>
          Dismiss
        </button>
      </div>
    ) : null,
  DialogContent: ({
    children,
    onCloseAutoFocus,
    ...props
  }: {
    children: ReactNode;
    onCloseAutoFocus?: FocusEventHandler<HTMLDivElement>;
  }) => (
    <div {...props}>
      {children}
      <button
        type="button"
        onClick={() =>
          onCloseAutoFocus?.({
            preventDefault: vi.fn(),
          } as unknown as FocusEvent<HTMLDivElement>)
        }
      >
        Complete close autofocus
      </button>
    </div>
  ),
  DialogDescription: ({ children }: { children: ReactNode }) => (
    <p>{children}</p>
  ),
  DialogHeader: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));

import WorkspaceOverlayHost from './WorkspaceOverlayHost';

describe('WorkspaceOverlayHost', () => {
  it('renders one coherently named trusted dialog and dismisses through its owner', () => {
    const onDismiss = vi.fn();
    const returnFocusRef = createRef<HTMLElement>();
    const registration = getWorkspaceShellOverlayRegistration('shell-preview');

    render(
      <WorkspaceOverlayHost
        fallbackFocusRef={createRef<HTMLElement>()}
        isOpen
        onDismiss={onDismiss}
        overlay={{
          key: 'shell-preview',
          parameters: { reference: null },
        }}
        registration={registration}
        returnFocusRef={returnFocusRef}
      />,
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Temporary workspace overlay' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /trusted placeholder demonstrates restorable overlay state/i,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('No resource reference selected')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('restores the connected invoking control after dialog close', () => {
    const returnFocusRef = createRef<HTMLElement>();
    const invoker = document.createElement('button');
    document.body.append(invoker);
    returnFocusRef.current = invoker;
    const focusSpy = vi.spyOn(invoker, 'focus');

    render(
      <WorkspaceOverlayHost
        fallbackFocusRef={createRef<HTMLElement>()}
        isOpen
        onDismiss={vi.fn()}
        overlay={{
          key: 'notifications',
          parameters: {},
        }}
        registration={getWorkspaceShellOverlayRegistration('notifications')}
        returnFocusRef={returnFocusRef}
      />,
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Complete close autofocus' }),
    );

    expect(focusSpy).toHaveBeenCalledWith({ preventScroll: true });
    expect(returnFocusRef.current).toBeNull();
    invoker.remove();
  });

  it('restores the shell primary region when the invoker was removed', () => {
    const returnFocusRef = createRef<HTMLElement>();
    const fallbackFocusRef = createRef<HTMLElement>();
    const removedInvoker = document.createElement('button');
    const primaryRegion = document.createElement('main');
    document.body.append(primaryRegion);
    returnFocusRef.current = removedInvoker;
    fallbackFocusRef.current = primaryRegion;
    const focusSpy = vi.spyOn(primaryRegion, 'focus');

    render(
      <WorkspaceOverlayHost
        fallbackFocusRef={fallbackFocusRef}
        isOpen
        onDismiss={vi.fn()}
        overlay={{
          key: 'notifications',
          parameters: {},
        }}
        registration={getWorkspaceShellOverlayRegistration('notifications')}
        returnFocusRef={returnFocusRef}
      />,
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Complete close autofocus' }),
    );

    expect(focusSpy).toHaveBeenCalledWith({ preventScroll: true });
    expect(returnFocusRef.current).toBeNull();
    primaryRegion.remove();
  });

  it('renders nothing for unresolved or untrusted overlay state', () => {
    render(
      <WorkspaceOverlayHost
        fallbackFocusRef={createRef<HTMLElement>()}
        isOpen
        onDismiss={vi.fn()}
        overlay={null}
        registration={null}
        returnFocusRef={createRef<HTMLElement>()}
      />,
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders product-owned content inside the trusted host boundary', () => {
    render(
      <WorkspaceOverlayHost
        content={<div>Authorized workflow choices</div>}
        fallbackFocusRef={createRef<HTMLElement>()}
        isOpen
        onDismiss={vi.fn()}
        overlay={{ key: 'workflow-picker', parameters: {} }}
        registration={getWorkspaceShellOverlayRegistration('workflow-picker')}
        returnFocusRef={createRef<HTMLElement>()}
      />,
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Authorized workflow choices')).toBeVisible();
    expect(screen.queryByText('No resource reference selected')).toBeNull();
  });

  it('renders the trusted Library adapter and returns the canonical reference', () => {
    const onSelectLibraryReference = vi.fn();

    render(
      <WorkspaceOverlayHost
        fallbackFocusRef={createRef<HTMLElement>()}
        isOpen
        onDismiss={vi.fn()}
        onSelectLibraryReference={onSelectLibraryReference}
        overlay={{ key: 'library-picker', parameters: {} }}
        registration={getWorkspaceShellOverlayRegistration('library-picker')}
        returnFocusRef={createRef<HTMLElement>()}
        threadId="thread-1"
      />,
    );

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Select Library source for thread-1',
      }),
    );

    expect(onSelectLibraryReference).toHaveBeenCalledWith({
      brandId: 'brand-1',
      kind: 'ingredient',
      organizationId: 'org-1',
      recordId: 'ingredient-1',
      serializer: 'ingredient',
    });
  });
});
