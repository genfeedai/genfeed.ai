import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { getWorkspaceShellOverlayRegistration } from '@/lib/workspace-shell/workspace-shell-registry';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

vi.mock('@/features/library-remix/LibraryPickerOverlay', () => ({
  default: ({
    onSelect,
  }: {
    onSelect: (reference: {
      brandId: string;
      kind: 'ingredient';
      organizationId: string;
      recordId: string;
      serializer: 'ingredient';
    }) => void;
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
      Select Library source
    </button>
  ),
}));

vi.mock('@ui/overlays/context-inspector/ContextInspector', () => ({
  default: ({
    children,
    description,
    isOpen,
    onCloseAutoFocus,
    onOpenChange,
    title,
  }: {
    children: ReactNode;
    description?: ReactNode;
    isOpen: boolean;
    onCloseAutoFocus?: (event: Event) => void;
    onOpenChange: (isOpen: boolean) => void;
    title: ReactNode;
  }) =>
    isOpen ? (
      <div role="dialog">
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
        {children}
        <button type="button" onClick={() => onOpenChange(false)}>
          Dismiss
        </button>
        <button
          type="button"
          onClick={() =>
            onCloseAutoFocus?.({ preventDefault: vi.fn() } as unknown as Event)
          }
        >
          Complete close autofocus
        </button>
      </div>
    ) : null,
}));

import WorkspaceOverlayHost from './WorkspaceOverlayHost';

describe('WorkspaceOverlayHost', () => {
  it('renders one coherently named trusted dialog and dismisses through its owner', () => {
    const onDismiss = vi.fn();
    const returnFocusRef = createRef<HTMLElement>();
    const registration = getWorkspaceShellOverlayRegistration('notifications');

    render(
      <WorkspaceOverlayHost
        fallbackFocusRef={createRef<HTMLElement>()}
        isOpen
        onDismiss={onDismiss}
        overlay={{
          key: 'notifications',
          parameters: {},
        }}
        registration={registration}
        returnFocusRef={returnFocusRef}
      />,
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Notifications' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /review workspace notifications without leaving the active conversation/i,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText('No content configured for this overlay.'),
    ).toBeVisible();

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
});
