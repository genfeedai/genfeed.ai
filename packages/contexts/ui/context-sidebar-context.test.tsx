import {
  ContextSidebarOutlet,
  ContextSidebarPanel,
  ContextSidebarProvider,
  useContextSidebar,
} from '@genfeedai/contexts/ui/context-sidebar-context';
import type { ContextSidebarSelection } from '@props/ui/context-sidebar.props';
import { fireEvent, render, screen } from '@testing-library/react';
import { createContext, type ReactNode, useContext, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const PageContext = createContext<string | null>(null);

function PageValue() {
  return <p>{useContext(PageContext) ?? 'no page context'}</p>;
}

function ShellProbe() {
  const contextSidebar = useContextSidebar();

  return (
    <div>
      <p data-testid="probe">
        {JSON.stringify({
          isMobileOpen: contextSidebar?.isMobileOpen,
          isOpen: contextSidebar?.isOpen,
          selection: contextSidebar?.selection?.title ?? null,
        })}
      </p>
      <button type="button" onClick={contextSidebar?.close}>
        close
      </button>
      <button type="button" onClick={contextSidebar?.toggle}>
        toggle
      </button>
      <button type="button" onClick={contextSidebar?.reveal}>
        reveal
      </button>
      <button
        type="button"
        onClick={() => contextSidebar?.setIsMobileOpen(true)}
      >
        open drawer
      </button>
    </div>
  );
}

function Shell({ children }: { readonly children: ReactNode }) {
  return (
    <ContextSidebarProvider>
      <ShellProbe />
      <ContextSidebarOutlet testId="rail-outlet" />
      <ContextSidebarOutlet target="mobile" testId="drawer-outlet" />
      {children}
    </ContextSidebarProvider>
  );
}

function readProbe(): {
  readonly isMobileOpen: boolean;
  readonly isOpen: boolean;
  readonly selection: string | null;
} {
  return JSON.parse(screen.getByTestId('probe').textContent ?? '{}');
}

const ASSET: ContextSidebarSelection = {
  id: 'asset-1',
  kind: 'asset',
  origin: 'user',
  title: 'Launch still',
};

function stubCompactViewport(isCompact: boolean): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      addEventListener: vi.fn(),
      matches: isCompact,
      media: query,
      removeEventListener: vi.fn(),
    })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ContextSidebarPanel', () => {
  it('renders nothing without the shell provider', () => {
    render(
      <ContextSidebarPanel selection={ASSET}>
        <p>asset detail</p>
      </ContextSidebarPanel>,
    );

    expect(screen.queryByText('asset detail')).toBeNull();
  });

  it('portals the selection into the rail and keeps the page providers', () => {
    render(
      <Shell>
        <PageContext value="page-owned state">
          <ContextSidebarPanel selection={ASSET}>
            <PageValue />
          </ContextSidebarPanel>
        </PageContext>
      </Shell>,
    );

    expect(screen.getByTestId('rail-outlet')).toHaveTextContent(
      'page-owned state',
    );
    expect(readProbe()).toEqual({
      isMobileOpen: false,
      isOpen: true,
      selection: 'Launch still',
    });
  });

  it('hands close to the page and closes when the page deselects', () => {
    function Page() {
      const [selection, setSelection] =
        useState<ContextSidebarSelection | null>(ASSET);

      return (
        <ContextSidebarPanel
          onClose={() => setSelection(null)}
          selection={selection}
        >
          <p>asset detail</p>
        </ContextSidebarPanel>
      );
    }

    render(
      <Shell>
        <Page />
      </Shell>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'close' }));

    expect(screen.queryByText('asset detail')).toBeNull();
    expect(readProbe()).toEqual({
      isMobileOpen: false,
      isOpen: false,
      selection: null,
    });
  });

  it('reopens for a new selection but never fights a collapse of the same one', () => {
    function Page({
      selection,
    }: {
      readonly selection: ContextSidebarSelection;
    }) {
      return (
        <ContextSidebarPanel onClose={() => undefined} selection={selection}>
          <p>{selection.title}</p>
        </ContextSidebarPanel>
      );
    }

    const { rerender } = render(
      <Shell>
        <Page selection={ASSET} />
      </Shell>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'toggle' }));
    expect(readProbe().isOpen).toBe(false);

    // Same selection, refreshed title: stays collapsed.
    rerender(
      <Shell>
        <Page selection={{ ...ASSET, title: 'Launch still v2' }} />
      </Shell>,
    );
    expect(readProbe()).toMatchObject({
      isOpen: false,
      selection: 'Launch still v2',
    });

    rerender(
      <Shell>
        <Page selection={{ ...ASSET, id: 'asset-2', title: 'Second asset' }} />
      </Shell>,
    );
    expect(readProbe()).toMatchObject({
      isOpen: true,
      selection: 'Second asset',
    });
  });

  it('keeps a closed-by-default selection closed until toggled', () => {
    render(
      <Shell>
        <ContextSidebarPanel
          selection={{ ...ASSET, isOpenByDefault: false, kind: 'run' }}
        >
          <p>run detail</p>
        </ContextSidebarPanel>
      </Shell>,
    );

    expect(readProbe()).toMatchObject({ isOpen: false });
    fireEvent.click(screen.getByRole('button', { name: 'toggle' }));
    expect(readProbe()).toMatchObject({ isOpen: true });
  });

  it('opens the mobile drawer for a user tap, never for an automatic selection', () => {
    stubCompactViewport(true);
    function Page() {
      const [selection, setSelection] = useState<ContextSidebarSelection>({
        ...ASSET,
        origin: 'automatic',
      });

      return (
        <>
          <button
            type="button"
            onClick={() =>
              setSelection({ ...ASSET, id: 'asset-2', origin: 'user' })
            }
          >
            tap asset
          </button>
          <ContextSidebarPanel selection={selection}>
            <p>{selection.id}</p>
          </ContextSidebarPanel>
        </>
      );
    }

    render(
      <Shell>
        <Page />
      </Shell>,
    );
    expect(readProbe().isMobileOpen).toBe(false);
    expect(screen.getByTestId('rail-outlet')).toHaveTextContent('asset-1');

    fireEvent.click(screen.getByRole('button', { name: 'tap asset' }));
    expect(readProbe().isMobileOpen).toBe(true);
    // An open drawer takes the panel from the (hidden) rail.
    expect(screen.getByTestId('drawer-outlet')).toHaveTextContent('asset-2');
    expect(screen.getByTestId('rail-outlet')).toBeEmptyDOMElement();
  });

  it('keeps the drawer closed on desktop widths', () => {
    stubCompactViewport(false);

    render(
      <Shell>
        <ContextSidebarPanel selection={{ ...ASSET, origin: 'user' }}>
          <p>asset detail</p>
        </ContextSidebarPanel>
      </Shell>,
    );

    expect(readProbe()).toMatchObject({ isMobileOpen: false, isOpen: true });
  });

  it('moves the panel into the drawer when the topbar opens it', () => {
    render(
      <Shell>
        <ContextSidebarPanel selection={ASSET}>
          <p>asset detail</p>
        </ContextSidebarPanel>
      </Shell>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'open drawer' }));

    expect(screen.getByTestId('drawer-outlet')).toHaveTextContent(
      'asset detail',
    );
  });

  it('opens the drawer when the user taps the item the page picked automatically', () => {
    stubCompactViewport(true);
    function Page() {
      const [selection, setSelection] = useState<ContextSidebarSelection>({
        ...ASSET,
        origin: 'automatic',
      });

      return (
        <>
          <button
            type="button"
            onClick={() => setSelection({ ...ASSET, origin: 'user' })}
          >
            tap same asset
          </button>
          <ContextSidebarPanel selection={selection}>
            <p>{selection.origin}</p>
          </ContextSidebarPanel>
        </>
      );
    }

    render(
      <Shell>
        <Page />
      </Shell>,
    );
    expect(readProbe().isMobileOpen).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'tap same asset' }));

    expect(readProbe()).toMatchObject({ isMobileOpen: true, isOpen: true });
    expect(screen.getByTestId('drawer-outlet')).toHaveTextContent('user');
  });

  it('reveals a collapsed selection, and the drawer on compact widths', () => {
    stubCompactViewport(true);
    render(
      <Shell>
        <ContextSidebarPanel selection={{ ...ASSET, origin: 'automatic' }}>
          <p>asset detail</p>
        </ContextSidebarPanel>
      </Shell>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'toggle' }));
    expect(readProbe()).toMatchObject({ isMobileOpen: false, isOpen: false });

    fireEvent.click(screen.getByRole('button', { name: 'reveal' }));

    expect(readProbe()).toMatchObject({ isMobileOpen: true, isOpen: true });
  });

  it('reveals nothing when nothing is selected', () => {
    render(<Shell>{null}</Shell>);

    fireEvent.click(screen.getByRole('button', { name: 'reveal' }));

    expect(readProbe()).toMatchObject({ isMobileOpen: false, isOpen: false });
  });
});
