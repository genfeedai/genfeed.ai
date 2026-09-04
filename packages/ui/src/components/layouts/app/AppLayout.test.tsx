import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import Container from '@ui/layout/container/Container';
import AppLayout from '@ui/layouts/app/AppLayout';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

function MenuComponent(): ReactElement {
  return <div data-testid="menu-component">Menu</div>;
}

describe('AppLayout', () => {
  const localStorageStore = new Map<string, string>();

  beforeEach(() => {
    if (!window.localStorage) {
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        value: {
          clear: () => localStorageStore.clear(),
          getItem: (key: string) => localStorageStore.get(key) ?? null,
          removeItem: (key: string) => localStorageStore.delete(key),
          setItem: (key: string, value: string) =>
            localStorageStore.set(key, value),
        },
      });
    }

    window.localStorage.clear();
  });

  it('renders layout shell', () => {
    render(
      <AppLayout>
        <div>Content</div>
      </AppLayout>,
    );

    const contentShell = screen.getByTestId('app-content-shell');
    const mainContent = screen.getByTestId('app-main-content');

    expect(contentShell).toBeInTheDocument();
    expect(mainContent).toBeInTheDocument();
    expect(contentShell).toHaveClass(
      'relative',
      'flex',
      'flex-col',
      'min-h-screen',
      'bg-background',
    );
    expect(contentShell).toHaveClass('md:pl-[var(--desktop-sidebar-width)]');
    expect(mainContent).toHaveClass('flex', 'flex-1', 'flex-col');
    expect(mainContent).not.toHaveClass('overflow-y-auto');
    expect(screen.getByText('Content')).toBeInTheDocument();
  });

  it('renders a shell banner before page content inside the main region', () => {
    render(
      <AppLayout bannerComponent={<div data-testid="shell-banner">Banner</div>}>
        <div data-testid="page-content">Content</div>
      </AppLayout>,
    );

    const mainContent = screen.getByTestId('app-main-content');
    const bannerShell = screen.getByTestId('app-banner-shell');
    const pageContent = screen.getByTestId('page-content');

    expect(bannerShell).toBeInTheDocument();
    expect(
      bannerShell.compareDocumentPosition(pageContent) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(mainContent.firstElementChild).toBe(bannerShell);
  });

  it('uses document scrolling instead of trapping vertical overflow in the center shell', () => {
    render(
      <AppLayout>
        <div>Content</div>
      </AppLayout>,
    );

    const layoutRoot = screen.getByTestId('app-content-shell').parentElement;
    const contentShell = screen.getByTestId('app-content-shell');

    expect(layoutRoot).toHaveClass(
      'min-h-screen',
      'overflow-x-hidden',
      'bg-background',
    );
    expect(layoutRoot).not.toHaveClass('h-dvh', 'overflow-hidden');
    expect(contentShell).toHaveClass('flex', 'flex-col');
    expect(contentShell).not.toHaveClass('overflow-y-auto', 'min-h-0');
    expect(screen.getByTestId('app-main-content')).toHaveClass(
      'flex',
      'flex-1',
      'flex-col',
    );
    expect(screen.getByTestId('app-main-content')).not.toHaveClass(
      'min-h-0',
      'overflow-hidden',
    );
  });

  it('locks the conversation shell to the viewport so banners cannot double-scroll', () => {
    render(
      <AppLayout
        bannerComponent={<div data-testid="shell-banner">Banner</div>}
        lockViewportHeight
      >
        <div data-testid="page-content">Content</div>
      </AppLayout>,
    );

    const layoutRoot = screen.getByTestId('app-content-shell').parentElement;
    const contentShell = screen.getByTestId('app-content-shell');
    const mainContent = screen.getByTestId('app-main-content');

    expect(layoutRoot).toHaveClass('h-dvh', 'overflow-hidden');
    expect(contentShell).toHaveClass('h-dvh', 'overflow-hidden', 'flex');
    expect(mainContent).toHaveClass(
      'flex',
      'min-h-0',
      'flex-1',
      'overflow-hidden',
    );
    expect(screen.getByTestId('shell-banner')).toBeInTheDocument();
    expect(screen.getByTestId('page-content')).toBeInTheDocument();
  });

  it('renders a distinct left rail when a menu component is provided', () => {
    render(
      <AppLayout menuComponent={<MenuComponent />}>
        <div>Content</div>
      </AppLayout>,
    );

    const rail = screen.getByTestId('desktop-sidebar-rail');
    expect(rail).toBeInTheDocument();
    expect(rail).toHaveClass('border-r', 'border-border');
    expect(rail).toHaveClass('bg-background');
    expect(rail).toHaveClass('fixed', 'bottom-0', 'left-0');
    expect(rail).toHaveStyle({ top: 'var(--desktop-titlebar-height)' });
    expect(screen.getAllByTestId('menu-component')).toHaveLength(2);
  });

  it('marks the workspace shell root without renaming the nav column', () => {
    render(
      <AppLayout isWorkspaceShell menuComponent={<MenuComponent />}>
        <div>Content</div>
      </AppLayout>,
    );

    // The column is the active module's, not the conversation's.
    expect(screen.getByLabelText('Navigation')).toBeInTheDocument();
    expect(
      screen.getByTestId('app-content-shell').parentElement,
    ).toHaveAttribute('data-workspace-shell', 'true');
  });

  it('keeps one sidebar toggle at the same left anchor when collapsed', async () => {
    window.localStorage.setItem('genfeed:sidebar:collapsed:auth', 'true');

    render(
      <AppLayout menuComponent={<MenuComponent />}>
        <div>Content</div>
      </AppLayout>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('desktop-sidebar-rail')).toHaveStyle({
        minWidth: '0px',
        width: '0px',
      });
    });

    const expandToggle = screen.getByRole('button', {
      name: 'Expand sidebar',
    });

    expect(expandToggle).toBeInTheDocument();
    expect(
      screen.getAllByRole('button', { name: 'Expand sidebar' }),
    ).toHaveLength(1);
    expect(expandToggle).toHaveClass('group');
    expect(expandToggle).toHaveClass('left-3');
    expect(expandToggle).not.toHaveClass('overflow-hidden');
    expect(expandToggle.querySelectorAll('svg')).toHaveLength(1);
    const logo = expandToggle.querySelector('img');
    expect(logo?.getAttribute('src')).toContain('logo.svg');
    expect(logo?.parentElement).toHaveClass('group-hover:opacity-0');
    expect(expandToggle.querySelector('svg')?.parentElement).toHaveClass(
      'opacity-0',
      'group-hover:opacity-100',
    );

    fireEvent.click(expandToggle);

    await waitFor(() => {
      // Expanded width is a CSS var so drag can update without React re-renders.
      expect(screen.getByTestId('desktop-sidebar-rail')).toHaveStyle({
        minWidth: 'var(--desktop-sidebar-width)',
        width: 'var(--desktop-sidebar-width)',
      });
    });
    expect(
      screen.queryByRole('button', { name: 'Expand sidebar' }),
    ).not.toBeInTheDocument();
  });

  it('restores a persisted expanded sidebar width on first paint', async () => {
    window.localStorage.setItem('genfeed:sidebar:width', '340');

    render(
      <AppLayout menuComponent={<MenuComponent />}>
        <div>Content</div>
      </AppLayout>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('app-content-shell').parentElement).toHaveStyle(
        {
          '--desktop-sidebar-width': '340px',
        },
      );
    });

    const resizeHandle = screen.getByRole('separator', {
      name: 'Resize navigation sidebar',
    });
    expect(resizeHandle).toHaveAttribute('aria-valuenow', '340');
    expect(resizeHandle).toHaveAttribute('aria-valuemin', '220');
    expect(resizeHandle).toHaveAttribute('aria-valuemax', '420');
  });

  it('resizes the sidebar with keyboard arrows and clamps at Home/End', async () => {
    window.localStorage.setItem('genfeed:sidebar:width', '280');

    render(
      <AppLayout menuComponent={<MenuComponent />}>
        <div>Content</div>
      </AppLayout>,
    );

    const resizeHandle = await screen.findByRole('separator', {
      name: 'Resize navigation sidebar',
    });

    fireEvent.keyDown(resizeHandle, { key: 'ArrowRight' });
    await waitFor(() => {
      expect(resizeHandle).toHaveAttribute('aria-valuenow', '296');
    });

    fireEvent.keyDown(resizeHandle, { key: 'ArrowLeft', shiftKey: true });
    await waitFor(() => {
      expect(resizeHandle).toHaveAttribute('aria-valuenow', '264');
    });

    fireEvent.keyDown(resizeHandle, { key: 'Home' });
    await waitFor(() => {
      expect(resizeHandle).toHaveAttribute('aria-valuenow', '220');
    });

    fireEvent.keyDown(resizeHandle, { key: 'End' });
    await waitFor(() => {
      expect(resizeHandle).toHaveAttribute('aria-valuenow', '420');
    });
  });

  it('updates the CSS var while dragging the resize handle', async () => {
    window.localStorage.setItem('genfeed:sidebar:width', '280');
    // jsdom lacks PointerEvent capture; drag path still attaches window listeners.
    HTMLElement.prototype.setPointerCapture = vi.fn();
    HTMLElement.prototype.releasePointerCapture = vi.fn();

    render(
      <AppLayout menuComponent={<MenuComponent />}>
        <div>Content</div>
      </AppLayout>,
    );

    const resizeHandle = await screen.findByRole('separator', {
      name: 'Resize navigation sidebar',
    });
    const layoutRoot = screen.getByTestId('app-content-shell').parentElement;

    fireEvent.pointerDown(resizeHandle, {
      clientX: 280,
      pointerId: 1,
    });
    fireEvent(
      window,
      new PointerEvent('pointermove', { clientX: 320, bubbles: true }),
    );

    await waitFor(() => {
      expect(layoutRoot).toHaveStyle({
        '--desktop-sidebar-width': '320px',
      });
    });

    fireEvent(window, new PointerEvent('pointerup', { bubbles: true }));

    await waitFor(() => {
      expect(resizeHandle).toHaveAttribute('aria-valuenow', '320');
    });
  });

  it('keeps default topbar chrome styling', () => {
    const TopbarMock = () => <div data-testid="topbar-mock" />;

    render(
      <AppLayout topbarComponent={TopbarMock}>
        <div>Content</div>
      </AppLayout>,
    );

    expect(screen.getByTestId('app-topbar-shell')).toHaveClass(
      'bg-background',
      'border-b',
      'border-border',
    );
  });

  it('gives the permanent topbar sole ownership of visible page identity', () => {
    const TopbarMock = () => <div data-testid="topbar-mock" />;

    render(
      <AppLayout topbarComponent={TopbarMock}>
        <Container
          description="Create keys for headless clients and MCP servers."
          label="API Keys"
        >
          <div>Page controls</div>
        </Container>
      </AppLayout>,
    );

    expect(
      screen.getByRole('heading', { level: 1, name: 'API Keys' }),
    ).toHaveClass('sr-only');
    expect(
      screen.queryByText('Create keys for headless clients and MCP servers.'),
    ).not.toBeInTheDocument();
    expect(screen.getByText('Page controls')).toBeInTheDocument();
  });
});
