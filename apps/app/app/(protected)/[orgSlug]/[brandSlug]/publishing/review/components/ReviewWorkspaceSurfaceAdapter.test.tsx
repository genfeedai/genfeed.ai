import {
  ContextSidebarOutlet,
  ContextSidebarProvider,
  useContextSidebar,
} from '@contexts/ui/context-sidebar-context';
import type { ReviewWorkspaceSurfaceAdapterProps } from '@props/publishing/review-workspace-surface-adapter.props';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const setPageContext = vi.fn();

vi.mock('@genfeedai/agent', () => ({
  useAgentChatStore: Object.assign(
    (selector: (state: { setPageContext: typeof setPageContext }) => unknown) =>
      selector({ setPageContext }),
    {
      getState: () => ({
        pageContext: {
          route: '/acme/brand/publishing/review',
          suggestedActions: [],
        },
      }),
    },
  ),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/acme/brand/publishing/review',
}));

vi.mock('./ReviewDetailPanel', () => ({
  default: function MockReviewDetailPanel({
    item,
  }: {
    item: { caption: string } | null;
  }) {
    return <div data-testid="review-detail-panel">{item?.caption}</div>;
  },
}));

import ReviewWorkspaceSurfaceAdapter from './ReviewWorkspaceSurfaceAdapter';

const baseItem = {
  batchId: 'batch-1',
  caption: 'Ship the review rail',
  createdAt: '2026-03-10T10:00:00.000Z',
  format: 'image',
  id: 'item-1',
  platform: 'twitter',
  status: 'COMPLETED',
};

function ShellControls() {
  const contextSidebar = useContextSidebar();

  return (
    <>
      <p data-testid="sidebar-state">
        {contextSidebar?.isOpen ? 'open' : 'closed'}
      </p>
      <p data-testid="sidebar-drawer">
        {contextSidebar?.isMobileOpen ? 'drawer-open' : 'drawer-closed'}
      </p>
      <p data-testid="sidebar-selection">
        {contextSidebar?.selection ? 'registered' : 'none'}
      </p>
      <button type="button" onClick={contextSidebar?.close}>
        Close sidebar
      </button>
    </>
  );
}

function Shell({ children }: { readonly children: ReactNode }) {
  return (
    <ContextSidebarProvider>
      <ShellControls />
      <ContextSidebarOutlet testId="context-sidebar-outlet" />
      {children}
    </ContextSidebarProvider>
  );
}

function renderAdapter(overrides: Partial<ReviewWorkspaceSurfaceAdapterProps>) {
  const props: ReviewWorkspaceSurfaceAdapterProps = {
    activeItem: baseItem as never,
    activeItemOrigin: 'automatic',
    isActioning: false,
    isSelected: false,
    onApprove: vi.fn(),
    onAssign: vi.fn(),
    onReject: vi.fn(),
    onRequestChanges: vi.fn(),
    onToggleSelect: vi.fn(),
    onUnassign: vi.fn(),
    revealRequest: 0,
    ...overrides,
  };

  const view = render(
    <Shell>
      <ReviewWorkspaceSurfaceAdapter {...props} />
    </Shell>,
  );

  return {
    ...view,
    rerenderAdapter: (next: Partial<ReviewWorkspaceSurfaceAdapterProps>) =>
      view.rerender(
        <Shell>
          <ReviewWorkspaceSurfaceAdapter {...props} {...next} />
        </Shell>,
      ),
  };
}

function stubCompactViewport(): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      addEventListener: vi.fn(),
      matches: true,
      media: query,
      removeEventListener: vi.fn(),
    })),
  );
}

describe('ReviewWorkspaceSurfaceAdapter', () => {
  beforeEach(() => {
    setPageContext.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('opens the mobile drawer through the tap reveal, not the automatic pick', () => {
    stubCompactViewport();
    const { rerenderAdapter } = renderAdapter({
      activeItemOrigin: 'automatic',
    });
    expect(screen.getByTestId('sidebar-drawer')).toHaveTextContent(
      'drawer-closed',
    );

    // Only the tap counter moves: the origin stays automatic, so the drawer
    // can open only through the adapter's reveal.
    rerenderAdapter({ activeItemOrigin: 'automatic', revealRequest: 1 });

    expect(screen.getByTestId('sidebar-drawer')).toHaveTextContent(
      'drawer-open',
    );
  });

  it('brings the details back on a row tap, including the active row', () => {
    const { rerenderAdapter } = renderAdapter({});
    fireEvent.click(screen.getByRole('button', { name: 'Close sidebar' }));

    rerenderAdapter({ activeItemOrigin: 'user', revealRequest: 1 });

    expect(screen.getByTestId('sidebar-selection')).toHaveTextContent(
      'registered',
    );
    expect(screen.getByTestId('sidebar-state')).toHaveTextContent('open');
    expect(screen.getByTestId('context-sidebar-outlet')).toHaveTextContent(
      'Ship the review rail',
    );
  });

  it('brings the details back on workspace:force-open-review-context', () => {
    renderAdapter({});
    fireEvent.click(screen.getByRole('button', { name: 'Close sidebar' }));

    act(() => {
      window.dispatchEvent(
        new CustomEvent('workspace:force-open-review-context'),
      );
    });

    expect(screen.getByTestId('sidebar-selection')).toHaveTextContent(
      'registered',
    );
    expect(screen.getByTestId('sidebar-state')).toHaveTextContent('open');
  });
});
