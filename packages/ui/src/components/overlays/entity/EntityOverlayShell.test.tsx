import '@testing-library/jest-dom/vitest';
import {
  ENTITY_OVERLAY_OPEN_AGENT_REQUESTED_EVENT,
  ENTITY_OVERLAY_OPENED_EVENT,
} from '@services/core/agent-overlay-coordination.service';
import { fireEvent, render, screen } from '@testing-library/react';
import EntityOverlayShell from '@ui/overlays/entity/EntityOverlayShell';
import type { PropsWithChildren, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@helpers/ui/modal/modal.helper', () => ({
  closeModal: vi.fn(),
  isModalOpen: vi.fn(() => true),
  openModal: vi.fn(),
  subscribeModal: vi.fn(() => () => undefined),
}));

vi.mock('@ui/primitives/sheet', () => ({
  Sheet: ({
    children,
    open,
  }: PropsWithChildren<{
    open: boolean;
    onOpenChange: (open: boolean) => void;
  }>) => (open ? <div data-testid="sheet">{children}</div> : null),
  SheetContent: ({
    children,
    className,
  }: PropsWithChildren<{ className?: string }>) => (
    <div data-testid="sheet-content" className={className}>
      {children}
    </div>
  ),
  SheetDescription: ({ children, id }: PropsWithChildren<{ id?: string }>) => (
    <p id={id}>{children}</p>
  ),
  SheetHeader: ({ children }: PropsWithChildren) => <div>{children}</div>,
  SheetTitle: ({ children }: PropsWithChildren) => <h2>{children}</h2>,
}));

vi.mock('@ui/buttons/base/Button', () => ({
  __esModule: true,
  default: ({
    label,
    onClick,
    children,
    ...props
  }: {
    label?: ReactNode;
    children?: ReactNode;
    onClick?: () => void;
  }) => (
    <button type="button" onClick={onClick} {...props}>
      {label || children}
    </button>
  ),
}));

describe('EntityOverlayShell', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: globalThis,
    });

    Object.defineProperty(globalThis, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockReturnValue({
        addEventListener: vi.fn(),
        matches: true,
        removeEventListener: vi.fn(),
      }),
    });

    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: vi.fn().mockReturnValue('false'),
      },
    });
  });

  it('renders the standard open-page action when provided', () => {
    const handleOpenDetail = vi.fn();

    render(
      <EntityOverlayShell
        id="entity-overlay"
        title="Entity"
        description="Entity description"
        onOpenDetail={handleOpenDetail}
      >
        <div>Body</div>
      </EntityOverlayShell>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open page' }));

    expect(handleOpenDetail).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Body')).toBeInTheDocument();
  });

  it('dispatches an overlay-open event and exposes the open-agent action on desktop', () => {
    const dispatchEventSpy = vi.spyOn(window, 'dispatchEvent');
    const openAgentRequestedSpy = vi.fn();

    window.addEventListener(
      ENTITY_OVERLAY_OPEN_AGENT_REQUESTED_EVENT,
      openAgentRequestedSpy,
    );

    render(
      <EntityOverlayShell
        id="entity-overlay"
        title="Entity"
        description="Entity description"
      >
        <div>Body</div>
      </EntityOverlayShell>,
    );

    expect(dispatchEventSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: { overlayId: 'entity-overlay' },
        type: ENTITY_OVERLAY_OPENED_EVENT,
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open agent' }));

    expect(openAgentRequestedSpy).toHaveBeenCalledTimes(1);

    window.removeEventListener(
      ENTITY_OVERLAY_OPEN_AGENT_REQUESTED_EVENT,
      openAgentRequestedSpy,
    );
  });
});
