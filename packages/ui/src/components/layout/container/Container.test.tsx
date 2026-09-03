import { render, screen } from '@testing-library/react';
import Container from '@ui/layout/container/Container';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';

const navigationState = vi.hoisted(() => ({
  hasCanonicalBreadcrumb: false,
}));

vi.mock('@genfeedai/contexts/ui/sidebar-navigation-context', () => ({
  useSidebarNavigation: () => navigationState,
}));

describe('Container', () => {
  beforeEach(() => {
    navigationState.hasCanonicalBreadcrumb = false;
  });

  it('renders children', () => {
    render(<Container>content</Container>);
    expect(screen.getByText('content')).toBeInTheDocument();
  });

  it('shows a visible title when breadcrumb does not own identity', () => {
    render(<Container label="Models">content</Container>);
    expect(screen.getByRole('heading', { name: 'Models' })).toBeVisible();
  });

  it('suppresses the visible title when a canonical breadcrumb is present', () => {
    navigationState.hasCanonicalBreadcrumb = true;

    render(<Container label="Models">content</Container>);

    expect(screen.getByRole('heading', { name: 'Models' })).toHaveClass(
      'sr-only',
    );
  });

  it('pins breadcrumb-only actions to the right via SectionTopbar module chrome', () => {
    navigationState.hasCanonicalBreadcrumb = true;

    render(
      <Container
        label="Brands"
        titleVisibility="sr-only"
        right={<button type="button">Add Brand</button>}
      >
        content
      </Container>,
    );

    const action = screen.getByRole('button', { name: 'Add Brand' });
    expect(screen.getByTestId('section-topbar')).toContainElement(action);
    expect(screen.getByTestId('section-topbar-actions')).toContainElement(
      action,
    );
    expect(screen.getByTestId('container')).toHaveAttribute(
      'data-module-chrome',
      'section-topbar',
    );
  });

  it('uses SectionTopbar for header tabs + actions (local nav contract)', () => {
    navigationState.hasCanonicalBreadcrumb = true;

    render(
      <Container
        label="Inbox"
        titleVisibility="sr-only"
        headerTabs={{
          activeTab: 'overview',
          fullWidth: false,
          items: [
            { href: '/test', id: 'overview', label: 'Overview' },
            { href: '/test/details', id: 'details', label: 'Details' },
          ],
          variant: 'pills',
        }}
        right={<button type="button">Refresh</button>}
      >
        content
      </Container>,
    );

    const overview = screen.getByRole('link', { name: 'Overview' });
    const refresh = screen.getByRole('button', { name: 'Refresh' });
    const topbar = screen.getByTestId('section-topbar');

    expect(topbar).toContainElement(overview);
    expect(topbar).toContainElement(refresh);
    expect(screen.getByTestId('section-topbar-tabs')).toContainElement(
      overview,
    );
    expect(screen.getByTestId('section-topbar-actions')).toContainElement(
      refresh,
    );
    // Full-bleed module bar, not padded orphan chrome.
    expect(topbar).toHaveClass('border-b', 'border-border');
  });

  it('uses SectionTopbar when title is visible and tabs + actions share the row', () => {
    render(
      <Container
        label="Models"
        headerTabs={{
          activeTab: 'overview',
          fullWidth: false,
          items: [
            { href: '/test', id: 'overview', label: 'Overview' },
            { href: '/test/details', id: 'details', label: 'Details' },
          ],
          variant: 'default',
        }}
        right={<button type="button">Refresh</button>}
      >
        content
      </Container>,
    );

    const topbar = screen.getByTestId('section-topbar');
    expect(topbar).toContainElement(
      screen.getByRole('heading', { name: 'Models' }),
    );
    expect(topbar).toContainElement(
      screen.getByRole('link', { name: 'Overview' }),
    );
    expect(topbar).toContainElement(
      screen.getByRole('button', { name: 'Refresh' }),
    );
  });

  it('promotes body tabs into SectionTopbar when primary actions are present', () => {
    const { container } = render(
      <Container
        label="Models"
        tabs={[
          { href: '/models/all', label: 'All' },
          { href: '/models/image', label: 'Image' },
        ]}
        right={<button type="button">Model</button>}
      >
        content
      </Container>,
    );

    const topbar = screen.getByTestId('section-topbar');
    expect(topbar).toContainElement(screen.getByRole('link', { name: 'All' }));
    expect(topbar).toContainElement(
      screen.getByRole('button', { name: 'Model' }),
    );
    // Single module chrome — no second orphan body strip
    expect(
      container.querySelectorAll('[data-testid="section-topbar"]').length,
    ).toBe(1);
  });

  it('keeps classic padded title+actions when there is no local tab nav', () => {
    render(
      <Container label="Users" right={<button type="button">Invite</button>}>
        content
      </Container>,
    );

    expect(screen.queryByTestId('section-topbar')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Users' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Invite' })).toBeInTheDocument();
    expect(screen.getByTestId('container-header-actions')).toContainElement(
      screen.getByRole('button', { name: 'Invite' }),
    );
    expect(screen.getByTestId('container')).toHaveAttribute(
      'data-module-chrome',
      'classic',
    );
  });

  it('keeps equal page insets when the title is chrome-only', () => {
    navigationState.hasCanonicalBreadcrumb = true;

    render(
      <Container fullWidth label="Overview" titleVisibility="sr-only">
        content
      </Container>,
    );

    const container = screen.getByTestId('container');

    expect(container).toHaveClass('py-5', 'sm:py-6');
    expect(container.className).not.toMatch(/\bpt-3\b/);
    expect(container.className).not.toMatch(/\bsm:pt-4\b/);
  });

  it('lifts body-only tabs into SectionTopbar (no orphan strip)', () => {
    render(
      <Container
        label="Warm-up"
        tabs={[
          { id: 'accounts', label: 'Accounts' },
          { id: 'create', label: 'Create' },
        ]}
        activeTab="accounts"
        onTabChange={() => undefined}
      >
        content
      </Container>,
    );

    const topbar = screen.getByTestId('section-topbar');
    expect(topbar).toContainElement(
      screen.getByRole('tab', { name: 'Accounts' }),
    );
    expect(screen.getByTestId('container')).toHaveAttribute(
      'data-module-chrome',
      'section-topbar',
    );
  });
});
