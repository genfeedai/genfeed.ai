import '@testing-library/jest-dom/vitest';
import type { IPagedItems } from '@genfeedai/contracts/interfaces';
import type { OrgMemoryEntry } from '@genfeedai/contracts/interfaces/settings/org-memory.interface';
import type { TableProps } from '@props/ui/display/table.props';
import { PagesService } from '@services/content/pages.service';
import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SettingsOrganizationMemoryPage from './content';

const listOrganization = vi.fn<() => Promise<IPagedItems<OrgMemoryEntry>>>();
const getService = vi.fn(async () => ({ listOrganization }));
const notifications = { error: vi.fn(), success: vi.fn() };
const replace = vi.fn();
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
vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: { getInstance: () => notifications },
}));
vi.mock('./edit-memory-dialog', () => ({ default: () => null }));
vi.mock('@ui/display/table/Table', () => ({
  default: ({
    items,
    isLoading,
  }: Pick<TableProps<OrgMemoryEntry>, 'items' | 'isLoading'>) => (
    <div>
      {isLoading
        ? 'Loading memories'
        : items.map((entry) => <span key={entry.id}>{entry.summary}</span>)}
    </div>
  ),
}));

describe('organization memory pagination', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listOrganization.mockResolvedValue(page);
    PagesService.setTotalDocs(200);
    PagesService.setTotalPages(20);
  });

  it('renders totals from the same response as the memory rows', async () => {
    const { rerender } = render(<SettingsOrganizationMemoryPage />);
    expect(await screen.findByText('Brand voice')).toBeVisible();
    expect(screen.getByText('51 memories')).toBeVisible();
    PagesService.setTotalDocs(900);
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
    render(<SettingsOrganizationMemoryPage />);
    expect(screen.getByText('Loading memories')).toBeVisible();
    expect(screen.queryByText('200 memories')).not.toBeInTheDocument();
    await act(async () => {
      resolvePage?.(page);
    });
    expect(screen.getByText('51 memories')).toBeVisible();
  });
});
