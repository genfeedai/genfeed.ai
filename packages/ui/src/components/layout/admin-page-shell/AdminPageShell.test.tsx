import { render, screen } from '@testing-library/react';
import AdminPageShell from '@ui/layout/admin-page-shell/AdminPageShell';
import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';

vi.mock('@genfeedai/contexts/ui/sidebar-navigation-context', () => ({
  useSidebarNavigation: () => ({ hasCanonicalBreadcrumb: true }),
}));

vi.mock('@genfeedai/contexts/ui/context-sidebar-context', () => ({
  useContextSidebar: () => null,
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../../../../apps/web/tests/next-intl.stub'
  );
  return { useTranslations: translateFromCatalog };
});

describe('AdminPageShell', () => {
  it('orders the subbar controls refresh, download, dropdown, Filters menu, view toggle, primary action', () => {
    render(
      <AdminPageShell
        title="Models"
        search={<input aria-label="Search" />}
        onRefresh={vi.fn()}
        download={<button type="button">Download</button>}
        dropdowns={<button type="button">All organizations</button>}
        filters={<button type="button">Filters</button>}
        views={<button type="button">Grid view</button>}
        primaryAction={<button type="button">Create</button>}
      >
        <p>body</p>
      </AdminPageShell>,
    );

    const actions = screen.getByTestId('section-topbar-actions');
    const labels = Array.from(actions.querySelectorAll('button')).map(
      (button) => button.getAttribute('aria-label') ?? button.textContent,
    );

    expect(labels).toEqual([
      'Refresh',
      'Download',
      'All organizations',
      'Filters',
      'Grid view',
      'Create',
    ]);
  });

  it('keeps the title screen-reader only and filters in the subbar', () => {
    render(
      <AdminPageShell
        title="Posts"
        search={<input aria-label="Search" />}
        filters={<button type="button">Filters</button>}
      >
        <p>body</p>
      </AdminPageShell>,
    );

    expect(screen.getByRole('heading', { name: 'Posts' })).toHaveClass(
      'sr-only',
    );
    expect(screen.getByTestId('section-topbar-leading')).toContainElement(
      screen.getByLabelText('Search'),
    );
    expect(screen.getByTestId('section-topbar-actions')).toContainElement(
      screen.getByRole('button', { name: 'Filters' }),
    );
  });
});
