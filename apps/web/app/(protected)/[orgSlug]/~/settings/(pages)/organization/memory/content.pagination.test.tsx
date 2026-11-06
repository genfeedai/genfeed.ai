import '@testing-library/jest-dom/vitest';
import {
  createTestQueryClient,
  queryClientWrapper,
} from '@app-tests/query-client.harness';
import type { IPagedItems } from '@genfeedai/contracts/interfaces';
import type { OrgMemoryEntry } from '@genfeedai/contracts/interfaces/settings/org-memory.interface';
import type { TableProps } from '@props/ui/display/table.props';

import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SettingsOrganizationMemoryPage from './content';

const listOrganization = vi.fn<() => Promise<IPagedItems<OrgMemoryEntry>>>();
const getService = vi.fn(async () => ({ listOrganization }));
const notifications = { error: vi.fn(), success: vi.fn() };
const replace = vi.fn();
const scope = vi.hoisted(() => ({ organizationId: 'org-1' }));
const page: IPagedItems<OrgMemoryEntry> = {
  items: [{ id: 'memory-1', summary: 'Brand voice' }],
  totals: { totalDocs: 51, totalPages: 4 },
};

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});
vi.mock('next/navigation', () => ({
  usePathname: () => '/org/~/settings/organization/memory',
  useRouter: () => ({ replace }),
  useSearchParams: () => new URLSearchParams('page=1'),
}));
vi.mock('@genfeedai/config/license', () => ({
  hasOrganizationBillingHint: () => true,
}));
vi.mock('@/hooks/auth/use-user-role/use-user-role', () => ({
  useUserRole: () => 'owner',
}));
vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ orgHref: (path: string) => '/org/~' + path }),
}));
vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => getService,
}));
vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', async () => ({
  useAuthIdentity: (await import('@app-tests/query-client.harness'))
    .useTestViewer,
}));
vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({ organizationId: scope.organizationId }),
}));
vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: { getInstance: () => notifications },
}));
vi.mock('./edit-memory-dialog', () => ({ default: () => null }));
vi.mock('@ui/display/table/Table', () => ({
  default: ({
    error,
    items,
    isLoading,
  }: Pick<TableProps<OrgMemoryEntry>, 'error' | 'items' | 'isLoading'>) => (
    <div>
      {isLoading
        ? 'Loading memories'
        : error && items.length === 0
          ? error.title
          : items.map((entry) => <span key={entry.id}>{entry.summary}</span>)}
    </div>
  ),
}));

describe('organization memory pagination', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    scope.organizationId = 'org-1';
    listOrganization.mockResolvedValue(page);
  });

  it('renders totals from the same response as the memory rows', async () => {
    const { rerender } = render(<SettingsOrganizationMemoryPage />, {
      wrapper: queryClientWrapper(),
    });
    expect(await screen.findByText('Brand voice')).toBeVisible();
    expect(screen.getByText('51 memories')).toBeVisible();

    rerender(<SettingsOrganizationMemoryPage />);
    expect(screen.getByText('51 memories')).toBeVisible();
    expect(screen.queryByText('900 memories')).not.toBeInTheDocument();
  });

  it('does not show another list total while the request is pending', async () => {
    let resolvePage: ((value: IPagedItems<OrgMemoryEntry>) => void) | undefined;
    listOrganization.mockReturnValue(
      new Promise((resolve) => {
        resolvePage = resolve;
      }),
    );
    render(<SettingsOrganizationMemoryPage />, {
      wrapper: queryClientWrapper(),
    });
    expect(screen.getByText('Loading memories')).toBeVisible();
    expect(screen.queryByText('200 memories')).not.toBeInTheDocument();
    await act(async () => {
      resolvePage?.(page);
    });
    await waitFor(() => {
      expect(screen.getByText('51 memories')).toBeVisible();
    });
  });

  it('paints the cached memories at once when coming back', async () => {
    const client = createTestQueryClient();
    const firstVisit = render(<SettingsOrganizationMemoryPage />, {
      wrapper: queryClientWrapper(client),
    });
    expect(await screen.findByText('Brand voice')).toBeVisible();
    firstVisit.unmount();

    listOrganization.mockReturnValue(new Promise(() => {}));
    render(<SettingsOrganizationMemoryPage />, {
      wrapper: queryClientWrapper(client),
    });

    expect(screen.getByText('Brand voice')).toBeVisible();
    expect(screen.getByText('51 memories')).toBeVisible();
    expect(screen.queryByText('Loading memories')).not.toBeInTheDocument();
  });

  it('never shows one organization’s memories under another', async () => {
    const client = createTestQueryClient();
    const firstVisit = render(<SettingsOrganizationMemoryPage />, {
      wrapper: queryClientWrapper(client),
    });
    expect(await screen.findByText('Brand voice')).toBeVisible();
    firstVisit.unmount();

    scope.organizationId = 'org-2';
    listOrganization.mockReturnValue(new Promise(() => {}));
    render(<SettingsOrganizationMemoryPage />, {
      wrapper: queryClientWrapper(client),
    });

    expect(screen.getByText('Loading memories')).toBeVisible();
    expect(screen.queryByText('Brand voice')).not.toBeInTheDocument();
  });

  it('shows the load error, not the skeleton, when the first read fails', async () => {
    listOrganization.mockRejectedValue(new Error('down'));
    render(<SettingsOrganizationMemoryPage />, {
      wrapper: queryClientWrapper(),
    });

    expect(
      await screen.findByText('Could not load organization memory'),
    ).toBeVisible();
    expect(screen.queryByText('Loading memories')).not.toBeInTheDocument();
  });
});
