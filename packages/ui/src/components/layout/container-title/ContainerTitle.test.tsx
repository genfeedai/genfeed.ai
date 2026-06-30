import { render, screen } from '@testing-library/react';
import ContainerTitle from '@ui/layout/container-title/ContainerTitle';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockSidebarNavigation = vi.hoisted(() => ({
  activeGroupId: null as string | null,
  activePageLabel: null as string | null,
}));

vi.mock('@genfeedai/contexts/ui/sidebar-navigation-context', () => ({
  useSidebarNavigation: () => mockSidebarNavigation,
}));

describe('ContainerTitle', () => {
  beforeEach(() => {
    mockSidebarNavigation.activeGroupId = null;
    mockSidebarNavigation.activePageLabel = null;
  });

  it('renders plain text descriptions inside a paragraph', () => {
    render(
      <ContainerTitle title="Images" description="Generated assets library" />,
    );

    expect(screen.getByText('Generated assets library').tagName).toStrictEqual(
      'P',
    );
  });

  it('renders rich descriptions without nesting block elements inside paragraphs', () => {
    render(
      <ContainerTitle
        title="Images"
        description={
          <div data-testid="rich-description">
            <span>Generated assets library</span>
          </div>
        }
      />,
    );

    const richDescription = screen.getByTestId('rich-description');

    expect(richDescription).toBeInTheDocument();
    expect(richDescription.closest('p')).toBeNull();
  });

  it('suppresses duplicate single-page breadcrumbs', () => {
    mockSidebarNavigation.activePageLabel = 'Dashboard';

    render(
      <ContainerTitle
        title="Dashboard"
        description="Workspace control plane"
      />,
    );

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
});
