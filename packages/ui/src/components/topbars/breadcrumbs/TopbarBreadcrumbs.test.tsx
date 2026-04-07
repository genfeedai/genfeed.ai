import { fireEvent, render, screen } from '@testing-library/react';
import TopbarBreadcrumbs from '@ui/topbars/breadcrumbs/TopbarBreadcrumbs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockExitNestedGroup = vi.fn();

let mockNavigationState = {
  activeGroupId: '',
  activePageLabel: '',
  exitNestedGroup: mockExitNestedGroup,
};

vi.mock('@contexts/ui/sidebar-navigation-context', () => ({
  useSidebarNavigation: () => ({
    activeGroupId: mockNavigationState.activeGroupId,
    activePageLabel: mockNavigationState.activePageLabel,
    enterNestedGroup: vi.fn(),
    exitNestedGroup: mockNavigationState.exitNestedGroup,
    groups: [],
    nestedGroupId: null,
  }),
}));

describe('TopbarBreadcrumbs', () => {
  beforeEach(() => {
    mockExitNestedGroup.mockClear();
    mockNavigationState = {
      activeGroupId: '',
      activePageLabel: '',
      exitNestedGroup: mockExitNestedGroup,
    };
  });

  it('returns null when there is no breadcrumb state', () => {
    const { container } = render(<TopbarBreadcrumbs />);

    expect(container.firstChild).toBeNull();
  });

  it('renders group and page without a leading slash', () => {
    mockNavigationState = {
      activeGroupId: 'Library',
      activePageLabel: 'Images',
      exitNestedGroup: mockExitNestedGroup,
    };

    render(<TopbarBreadcrumbs />);

    expect(screen.getByText('Library')).toBeInTheDocument();
    expect(screen.getByText('Images')).toBeInTheDocument();
    expect(screen.getAllByText('/')).toHaveLength(1);
  });

  it('uses the root label override for the first segment', () => {
    mockNavigationState = {
      activeGroupId: 'Library',
      activePageLabel: 'Images',
      exitNestedGroup: mockExitNestedGroup,
    };

    render(<TopbarBreadcrumbs rootLabel="Admin" />);

    expect(screen.getByText('Admin')).toBeInTheDocument();
    expect(screen.queryByText('Library')).not.toBeInTheDocument();
  });

  it('exits nested mode when the group breadcrumb is clicked', () => {
    mockNavigationState = {
      activeGroupId: 'Library',
      activePageLabel: 'Images',
      exitNestedGroup: mockExitNestedGroup,
    };

    render(<TopbarBreadcrumbs />);

    fireEvent.click(screen.getByRole('button', { name: 'Library' }));

    expect(mockExitNestedGroup).toHaveBeenCalledTimes(1);
  });

  it('renders a single group as plain text when there is no page label', () => {
    mockNavigationState = {
      activeGroupId: 'Library',
      activePageLabel: '',
      exitNestedGroup: mockExitNestedGroup,
    };

    render(<TopbarBreadcrumbs />);

    expect(screen.getByText('Library').tagName).toBe('SPAN');
    expect(screen.queryByRole('button', { name: 'Library' })).toBeNull();
  });
});
