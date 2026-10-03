import type { TopbarProps } from '@genfeedai/props/navigation/topbar.props';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import Container from '@ui/layout/container/Container';
import AppLayout from '@ui/layouts/app/AppLayout';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const navigationState = vi.hoisted(() => ({
  pathname: '/acme/brand/workspace',
}));
const routerMock = vi.hoisted(() => ({ back: vi.fn(), forward: vi.fn() }));
vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@ui/tests/next-intl.stub');

  return { useTranslations: translateFromCatalog };
});

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  usePathname: () => navigationState.pathname,
  useRouter: () => routerMock,
}));

function MenuComponent(): ReactElement {
  return <div data-testid="menu-component">Menu</div>;
}

function RailComponent({
  onNavigate,
}: {
  onNavigate?: () => void;
}): ReactElement {
  return (
    <button type="button" data-testid="rail-component" onClick={onNavigate}>
      Studio
    </button>
  );
}

function MenuToggleTopbar({ onMenuToggle }: TopbarProps): ReactElement {
  return (
    <button type="button" onClick={onMenuToggle}>
      Open navigation
    </button>
  );
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
    expect(contentShell).toHaveClass(
      'md:pl-[calc(var(--desktop-rail-width)+var(--desktop-sidebar-width))]',
    );
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
    // Chrome plane shared with the topbar. The right border is the page divider.
    expect(rail).toHaveClass('bg-gray-100', 'border-r', 'border-border');
    expect(rail).toHaveClass('fixed', 'bottom-0');
    expect(rail).toHaveStyle({
      left: 'var(--desktop-rail-width, 0px)',
      // Shares the content surface's top inset so its header lines up with the
      // topbar row.
      top: 'calc(var(--desktop-titlebar-height) + var(--shell-inset, 0px) + var(--shell-edge, 0px))',
    });
    expect(screen.getAllByTestId('menu-component')).toHaveLength(2);
    expect(screen.queryByTestId('desktop-app-rail')).not.toBeInTheDocument();
    expect(screen.getByTestId('app-content-shell').parentElement).toHaveStyle({
      '--desktop-rail-width': '0px',
    });
  });

  it('marks the shell chrome only when a rail is present, for the desktop title bar', () => {
    const { rerender } = render(
      <AppLayout>
        <div>Content</div>
      </AppLayout>,
    );
    const layoutRoot = screen.getByTestId('app-content-shell').parentElement;
    expect(layoutRoot).not.toHaveAttribute('data-shell-chrome');

    rerender(
      <AppLayout railComponent={<RailComponent />}>
        <div>Content</div>
      </AppLayout>,
    );
    expect(
      screen.getByTestId('app-content-shell').parentElement,
    ).toHaveAttribute('data-shell-chrome', 'true');
  });

  it('renders the app rail at the far left and offsets the shell by its width', () => {
    render(
      <AppLayout
        menuComponent={<MenuComponent />}
        railComponent={<RailComponent />}
        topbarComponent={MenuToggleTopbar}
      >
        <div>Content</div>
      </AppLayout>,
    );

    const appRail = screen.getByTestId('desktop-app-rail');

    expect(appRail).toHaveClass(
      'fixed',
      'left-0',
      'bottom-0',
      'w-[var(--desktop-rail-width)]',
      // Same plane as the topbar, no divider.
      'bg-gray-100',
    );
    expect(appRail).not.toHaveClass('border-r', 'bg-foreground/[0.04]');
    expect(appRail).toHaveStyle({ top: 'var(--desktop-titlebar-height)' });
    expect(appRail).not.toHaveClass('pt-[var(--shell-topbar-height)]');
    const mark = screen.getByTestId('app-rail-mark');
    const collapse = screen.getByRole('button', { name: 'Collapse sidebar' });
    expect(mark).toContainElement(collapse);
    expect(collapse.querySelector('img')?.getAttribute('src')).toContain(
      'logo.svg',
    );
    expect(appRail).toContainElement(mark);
    expect(screen.getByTestId('app-topbar-shell')).not.toContainElement(
      collapse,
    );
    expect(
      mark.compareDocumentPosition(screen.getAllByTestId('rail-component')[0]) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(appRail).toContainElement(
      screen.getAllByTestId('rail-component')[0],
    );
    expect(screen.getByTestId('app-content-shell').parentElement).toHaveStyle({
      '--desktop-rail-width': '40px',
      '--shell-topbar-height': '40px',
    });
    // Desktop: the topbar sits on the chrome plane, outside the page.
    expect(screen.getByTestId('app-topbar-shell')).toHaveClass(
      'fixed',
      'bg-gray-100',
      'md:static',
    );
    expect(screen.getByTestId('app-content-panel')).not.toContainElement(
      screen.getByTestId('app-topbar-shell'),
    );
  });

  it('keeps the menu and page in one rounded block under a chrome topbar', () => {
    render(
      <AppLayout
        menuComponent={<MenuComponent />}
        railComponent={<RailComponent />}
        topbarComponent={MenuToggleTopbar}
      >
        <div>Content</div>
      </AppLayout>,
    );

    const layoutRoot = screen.getByTestId('app-content-shell').parentElement;
    const contentShell = screen.getByTestId('app-content-shell');
    const panel = screen.getByTestId('app-content-panel');
    const mainContent = screen.getByTestId('app-main-content');
    const sidebar = screen.getByTestId('desktop-sidebar-rail');

    expect(layoutRoot).toHaveClass(
      'bg-gray-100',
      '[--shell-inset:0px]',
      '[--shell-edge:0px]',
      'md:[--shell-inset:0.5rem]',
      '[--shell-topbar-offset:var(--shell-topbar-height)]',
    );
    expect(layoutRoot).not.toHaveClass('md:[--shell-edge:1px]');
    // Shell starts after the rail. Inspector width is reserved on the panel,
    // not the shell, so the topbar icons stay put.
    expect(contentShell).toHaveClass(
      'md:pl-[var(--desktop-rail-width)]',
      'md:pt-[var(--desktop-titlebar-height)]',
      'md:h-dvh',
      'md:overflow-hidden',
    );
    expect(contentShell).not.toHaveClass(
      'xl:pr-[var(--workspace-inspector-width,0px)]',
    );
    expect(contentShell).not.toHaveClass(
      'md:pl-[calc(var(--desktop-rail-width)+var(--desktop-sidebar-width))]',
    );
    // Menu and page share the rounded block. The topbar stays outside it.
    expect(panel).toHaveClass(
      'bg-background',
      'md:mb-[var(--shell-inset)]',
      'xl:mr-[calc(var(--shell-inset)+var(--workspace-inspector-width,0px))]',
      'md:flex-row',
      'md:overflow-hidden',
      'md:rounded-lg',
      'md:border',
      'md:border-border',
    );
    expect(panel).not.toHaveClass('md:ml-[var(--shell-inset)]');
    expect(panel).toContainElement(sidebar);
    expect(sidebar).toHaveClass('relative', 'bg-gray-100', 'border-r');
    expect(sidebar).not.toHaveClass('fixed');
    expect(panel).not.toContainElement(screen.getByTestId('app-topbar-shell'));
    expect(contentShell).toContainElement(
      screen.getByTestId('app-topbar-shell'),
    );
    expect(screen.getByTestId('app-topbar-shell')).toHaveClass(
      'bg-gray-100',
      'md:border-b-0',
    );
    expect(mainContent).toHaveClass(
      'md:overflow-y-auto',
      'md:pt-0',
      'pt-[calc(var(--desktop-titlebar-height)+var(--shell-topbar-height))]',
    );
    expect(mainContent).toHaveAttribute('data-scroll-container', 'shell');
  });

  it('starts every route at the top of the panel scroll', () => {
    const { rerender } = render(
      <AppLayout railComponent={<RailComponent />}>
        <div>Content</div>
      </AppLayout>,
    );
    const mainContent = screen.getByTestId('app-main-content');
    // jsdom has no layout, so give scrollTop real state to observe the reset.
    let scrollTop = 240;
    Object.defineProperty(mainContent, 'scrollTop', {
      configurable: true,
      get: () => scrollTop,
      set: (value: number) => {
        scrollTop = value;
      },
    });

    navigationState.pathname = '/acme/brand/library/assets';
    rerender(
      <AppLayout railComponent={<RailComponent />}>
        <div>Content</div>
      </AppLayout>,
    );

    expect(scrollTop).toBe(0);
  });

  it('keeps the app rail when the sidebar collapses', async () => {
    window.localStorage.setItem('genfeed:sidebar:collapsed:auth', 'true');

    render(
      <AppLayout
        menuComponent={<MenuComponent />}
        railComponent={<RailComponent />}
      >
        <div>Content</div>
      </AppLayout>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('desktop-sidebar-rail')).toHaveStyle({
        width: '0px',
      });
    });
    expect(screen.getByTestId('desktop-sidebar-rail')).not.toHaveClass(
      'border-r',
    );
    const appRail = screen.getByTestId('desktop-app-rail');
    const expand = screen.getByRole('button', { name: 'Expand sidebar' });
    expect(appRail).toContainElement(expand);
    expect(expand).not.toHaveStyle({
      left: 'calc(var(--desktop-rail-width, 0px) + 0.75rem)',
    });
  });

  it('keeps the app rail on routes without a module sidebar', () => {
    render(
      <AppLayout railComponent={<RailComponent />}>
        <div>Content</div>
      </AppLayout>,
    );

    expect(screen.getByTestId('desktop-app-rail')).toBeInTheDocument();
    expect(
      screen.queryByTestId('desktop-sidebar-rail'),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('mobile-app-rail')).toBeInTheDocument();
  });

  it('puts the app rail in the mobile drawer and closes the drawer on navigation', () => {
    render(
      <AppLayout
        menuComponent={<MenuComponent />}
        railComponent={<RailComponent />}
        topbarComponent={MenuToggleTopbar}
      >
        <div>Content</div>
      </AppLayout>,
    );

    const mobileRail = screen.getByTestId('mobile-app-rail');
    const drawer = mobileRail.parentElement?.parentElement;

    // Clears the 40px fixed topbar that overlaps the top of the drawer.
    expect(mobileRail).toHaveClass('pt-[var(--shell-topbar-height)]');
    expect(drawer).toHaveClass('hidden');

    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
    expect(drawer).toHaveClass('flex');
    // The drawer renders before the desktop rounded block, so the mobile menu
    // is the first menu-component, next to the rail.
    expect(
      mobileRail.nextElementSibling?.querySelector(
        '[data-testid="menu-component"]',
      ),
    ).not.toBeNull();

    const mobileRailItem = mobileRail.querySelector(
      '[data-testid="rail-component"]',
    );
    expect(mobileRailItem).not.toBeNull();
    fireEvent.click(mobileRailItem as Element);

    expect(drawer).toHaveClass('hidden');
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
    expect(expandToggle).toHaveStyle({
      left: 'calc(var(--desktop-rail-width, 0px) + 0.75rem)',
    });
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

describe('AppLayout desktop titlebar', () => {
  type DesktopGlobal = typeof globalThis & {
    __GENFEED_RUNTIME_CONFIG__?: { clientSurface?: 'desktop' | 'web' };
  };
  const desktopGlobal = globalThis as DesktopGlobal;

  function renderChromeShell() {
    return render(
      <AppLayout
        menuComponent={<MenuComponent />}
        railComponent={<RailComponent />}
        topbarComponent={MenuToggleTopbar}
      >
        <div>Content</div>
      </AppLayout>,
    );
  }

  afterEach(() => {
    delete desktopGlobal.__GENFEED_RUNTIME_CONFIG__;
    vi.unstubAllGlobals();
  });

  it('keeps the browser topbar free of window controls', () => {
    renderChromeShell();

    expect(
      screen.queryByTestId('desktop-titlebar-controls'),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('app-rail-mark')).toContainElement(
      screen.getByRole('button', { name: 'Collapse sidebar' }),
    );
  });

  it('makes the topbar the macOS titlebar with the controls after the traffic lights', () => {
    desktopGlobal.__GENFEED_RUNTIME_CONFIG__ = { clientSurface: 'desktop' };
    vi.stubGlobal('navigator', {
      platform: 'MacIntel',
      userAgentData: { platform: 'macOS' },
    });

    renderChromeShell();

    const layoutRoot = screen.getByTestId('app-content-shell').parentElement;
    expect(layoutRoot).toHaveAttribute('data-desktop-titlebar', 'topbar');
    expect(layoutRoot).toHaveStyle({
      '--desktop-titlebar-height': '0px',
      '--desktop-traffic-lights-inset': '76px',
    });

    const controls = screen.getByTestId('desktop-titlebar-controls');
    expect(screen.getByTestId('app-topbar-shell')).toContainElement(controls);
    // The lights cover the rail's mark band, so its toggle moves here.
    expect(controls).toContainElement(
      screen.getByRole('button', { name: 'Collapse sidebar' }),
    );
    expect(screen.getByTestId('app-rail-mark')).toBeEmptyDOMElement();

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    fireEvent.click(screen.getByRole('button', { name: 'Forward' }));
    expect(routerMock.back).toHaveBeenCalledTimes(1);
    expect(routerMock.forward).toHaveBeenCalledTimes(1);
  });

  it('keeps the sidebar toggle in the rail on a native window frame', () => {
    desktopGlobal.__GENFEED_RUNTIME_CONFIG__ = { clientSurface: 'desktop' };
    vi.stubGlobal('navigator', {
      platform: 'Win32',
      userAgentData: { platform: 'Windows' },
    });

    renderChromeShell();

    const layoutRoot = screen.getByTestId('app-content-shell').parentElement;
    expect(layoutRoot).not.toHaveAttribute('data-desktop-titlebar');
    expect(layoutRoot).toHaveStyle({
      '--desktop-titlebar-height': '0px',
      '--desktop-traffic-lights-inset': '0px',
    });
    const controls = screen.getByTestId('desktop-titlebar-controls');
    expect(controls).toContainElement(
      screen.getByRole('button', { name: 'Back' }),
    );
    expect(screen.getByTestId('app-rail-mark')).toContainElement(
      screen.getByRole('button', { name: 'Collapse sidebar' }),
    );
  });
});
