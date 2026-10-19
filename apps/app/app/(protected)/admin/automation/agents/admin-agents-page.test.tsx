// @vitest-environment jsdom

import { AgentAutonomyMode } from '@genfeedai/contracts';
import type { TableColumn } from '@props/ui/display/table.props';
import type { AgentStrategy } from '@services/automation/agent-strategies.service';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import AdminAgentsPage from './admin-agents-page';

const mocks = vi.hoisted(() => ({
  findAllPages: vi.fn(),
}));

vi.mock('@genfeedai/hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => ({ isSignedIn: true }),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => ({
    findAllPages: mocks.findAllPages,
  }),
}));

vi.mock('@ui/content/admin-filters/AdminOrgBrandUrlFilter', () => ({
  default: () => <div>Organization filter</div>,
  useAdminOrgBrandParams: () => ({ brand: '', organization: 'org-2' }),
}));

vi.mock('@ui/layout/admin-page-shell/AdminPageShell', () => ({
  default: ({
    children,
    dropdowns,
  }: {
    children: ReactNode;
    dropdowns?: ReactNode;
  }) => (
    <div>
      {dropdowns}
      {children}
    </div>
  ),
}));

vi.mock('@ui/display/table/Table', () => ({
  default: ({
    columns,
    items,
  }: {
    columns: TableColumn<AgentStrategy>[];
    items: AgentStrategy[];
  }) => (
    <div>
      {items.map((item) => (
        <div key={item.id}>
          {item.label}
          {columns.map((column) => (
            <span key={String(column.key)}>{column.render?.(item)}</span>
          ))}
        </div>
      ))}
    </div>
  ),
}));

describe('AdminAgentsPage', () => {
  it("lists the selected organization's agents with their publishing mode", async () => {
    mocks.findAllPages.mockResolvedValue([
      {
        autonomyMode: AgentAutonomyMode.AUTO_PUBLISH,
        brand: { id: 'brand-1', label: 'Acme', slug: 'acme' },
        id: 'strategy-1',
        isActive: true,
        label: 'X growth agent',
        platforms: ['twitter'],
      },
    ]);

    render(
      <QueryClientProvider client={new QueryClient()}>
        <AdminAgentsPage />
      </QueryClientProvider>,
    );

    expect(await screen.findByText('X growth agent')).toBeTruthy();
    expect(screen.getByText('Auto-publish')).toBeTruthy();
    expect(screen.getByText('Acme')).toBeTruthy();
    expect(screen.getByText('Never')).toBeTruthy();
    await waitFor(() => {
      expect(mocks.findAllPages).toHaveBeenCalledWith({
        organizationId: 'org-2',
        sort: 'createdAt: -1',
      });
    });
  });
});
