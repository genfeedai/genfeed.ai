import { render, screen } from '@testing-library/react';
import PageHeader from '@ui/layout/page-header/PageHeader';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const navigationState = vi.hoisted(() => ({
  hasCanonicalBreadcrumb: false,
}));

vi.mock('@genfeedai/contexts/ui/sidebar-navigation-context', () => ({
  useSidebarNavigation: () => navigationState,
}));

describe('PageHeader', () => {
  beforeEach(() => {
    navigationState.hasCanonicalBreadcrumb = false;
  });

  it('should render without crashing', () => {
    const { container } = render(<PageHeader />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    const { container } = render(<PageHeader />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(<PageHeader />);
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toBeInTheDocument();
  });

  it('keeps only an accessible title when the shell owns page identity', () => {
    navigationState.hasCanonicalBreadcrumb = true;

    render(
      <PageHeader
        title="Library"
        description="Browse reusable assets across your workspace."
      />,
    );

    expect(
      screen.getByRole('heading', { level: 1, name: 'Library' }),
    ).toHaveClass('sr-only');
    expect(
      screen.queryByText('Browse reusable assets across your workspace.'),
    ).not.toBeInTheDocument();
  });
});
