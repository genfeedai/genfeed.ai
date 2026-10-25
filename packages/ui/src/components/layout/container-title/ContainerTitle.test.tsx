import { render, screen } from '@testing-library/react';
import ContainerTitle from '@ui/layout/container-title/ContainerTitle';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockSidebarNavigation = vi.hoisted(() => ({
  activeGroupId: null as string | null,
  activePageLabel: null as string | null,
  hasCanonicalBreadcrumb: false,
}));

vi.mock('@genfeedai/contexts/ui/sidebar-navigation-context', () => ({
  useSidebarNavigation: () => mockSidebarNavigation,
}));

describe('ContainerTitle', () => {
  beforeEach(() => {
    mockSidebarNavigation.activeGroupId = null;
    mockSidebarNavigation.activePageLabel = null;
    mockSidebarNavigation.hasCanonicalBreadcrumb = false;
  });

  it('suppresses duplicate single-page breadcrumbs', () => {
    mockSidebarNavigation.activePageLabel = 'Dashboard';

    render(<ContainerTitle title="Dashboard" />);

    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });

  it('keeps contextual breadcrumbs when they add information', () => {
    mockSidebarNavigation.activeGroupId = 'Settings';
    mockSidebarNavigation.activePageLabel = 'Billing';

    render(<ContainerTitle title="Billing" />);

    expect(screen.getByRole('navigation')).toHaveTextContent(
      'Settings›Billing',
    );
  });

  it('can keep the page heading accessible without rendering visible title chrome', () => {
    render(<ContainerTitle title="Dashboard" titleVisibility="sr-only" />);

    const heading = screen.getByRole('heading', {
      level: 1,
      name: 'Dashboard',
    });

    expect(heading).toHaveClass('sr-only');
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });

  it('defers visible page identity to a canonical shell breadcrumb', () => {
    mockSidebarNavigation.hasCanonicalBreadcrumb = true;

    render(<ContainerTitle title="Library" />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Library' }),
    ).toHaveClass('sr-only');
    expect(
      screen.queryByText('Browse reusable assets across your workspace.'),
    ).not.toBeInTheDocument();
  });
});
