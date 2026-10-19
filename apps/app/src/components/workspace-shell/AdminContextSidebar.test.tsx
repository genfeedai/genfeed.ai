import {
  ContextSidebarPanel,
  ContextSidebarProvider,
} from '@contexts/ui/context-sidebar-context';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AdminContextSidebar from './AdminContextSidebar';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

describe('AdminContextSidebar', () => {
  it('shows the selected record in the right column', () => {
    render(
      <ContextSidebarProvider>
        <AdminContextSidebar />
        <ContextSidebarPanel
          selection={{
            id: 'role-1',
            kind: 'record',
            origin: 'user',
            title: 'Admin role',
          }}
        >
          <p>Role detail</p>
        </ContextSidebarPanel>
      </ContextSidebarProvider>,
    );

    expect(screen.getByTestId('context-sidebar-outlet')).toHaveTextContent(
      'Role detail',
    );
    expect(screen.getByTestId('context-sidebar-title')).toHaveTextContent(
      'Admin role',
    );
  });

  it('renders nothing selected until a row is picked', () => {
    render(
      <ContextSidebarProvider>
        <AdminContextSidebar />
      </ContextSidebarProvider>,
    );

    expect(screen.queryByText('Role detail')).not.toBeInTheDocument();
  });
});
