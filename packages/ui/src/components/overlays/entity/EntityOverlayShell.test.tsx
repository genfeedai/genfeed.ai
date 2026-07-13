import '@testing-library/jest-dom/vitest';
import {
  getAgentOverlayCoordinationState,
  notifyEntityOverlayClosed,
  setCoordinatedAgentPanelOpen,
} from '@genfeedai/services/core/agent-overlay-coordination.service';
import { fireEvent, render, screen } from '@testing-library/react';
import EntityOverlayShell from '@ui/overlays/entity/EntityOverlayShell';
import type { PropsWithChildren, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/helpers/ui/modal/modal.helper', () => ({
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

    notifyEntityOverlayClosed('entity-overlay');
    setCoordinatedAgentPanelOpen(false);
  });

  afterEach(() => notifyEntityOverlayClosed('entity-overlay'));

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

  it('publishes typed inspection state and exposes the open-agent action on desktop', () => {
    const requestVersionBefore =
      getAgentOverlayCoordinationState().agentOpenRequestVersion;

    render(
      <EntityOverlayShell
        id="entity-overlay"
        title="Entity"
        description="Entity description"
      >
        <div>Body</div>
      </EntityOverlayShell>,
    );

    expect(getAgentOverlayCoordinationState().activeEntityOverlayIds).toContain(
      'entity-overlay',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open agent' }));

    expect(getAgentOverlayCoordinationState().agentOpenRequestVersion).toBe(
      requestVersionBefore + 1,
    );
  });

  it('hides the redundant open-agent action while the agent is open', () => {
    setCoordinatedAgentPanelOpen(true);

    render(
      <EntityOverlayShell
        id="entity-overlay"
        title="Entity"
        description="Entity description"
      >
        <div>Body</div>
      </EntityOverlayShell>,
    );

    expect(
      screen.queryByRole('button', { name: 'Open agent' }),
    ).not.toBeInTheDocument();
  });
});
