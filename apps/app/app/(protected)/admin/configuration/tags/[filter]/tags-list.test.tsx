import '@testing-library/jest-dom/vitest';
import { PageScope } from '@genfeedai/enums';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TagsList from './tags-list';

const mocks = vi.hoisted(() => ({
  deleteTag: vi.fn(),
  findAll: vi.fn(),
  findOrganizationTags: vi.fn(),
  loggerError: vi.fn(),
  loggerInfo: vi.fn(),
  notificationsError: vi.fn(),
  notificationsSuccess: vi.fn(),
  openConfirm: vi.fn(),
  openModal: vi.fn(),
  patch: vi.fn(),
  refetch: vi.fn(),
  replace: vi.fn(),
  setQueryData: vi.fn(),
  useQuery: vi.fn(),
}));

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({
    brandId: 'brand-1',
    organizationId: 'org-1',
  }),
}));

vi.mock('@helpers/ui/modal/modal.helper', () => ({
  openModal: mocks.openModal,
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: (factory: (token: string) => unknown) => async () =>
    factory('token-1'),
}));

vi.mock('@providers/global-modals/global-modals.provider', () => ({
  useConfirmModal: () => ({
    openConfirm: mocks.openConfirm,
  }),
}));

vi.mock('@services/content/tags.service', () => ({
  TagsService: {
    getInstance: () => ({
      delete: mocks.deleteTag,
      findAll: mocks.findAll,
      patch: mocks.patch,
    }),
  },
}));

vi.mock('@services/core/logger.service', () => ({
  logger: {
    error: mocks.loggerError,
    info: mocks.loggerInfo,
  },
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => ({
      error: mocks.notificationsError,
      success: mocks.notificationsSuccess,
    }),
  },
}));

vi.mock('@services/organization/organizations.service', () => ({
  OrganizationsService: {
    getInstance: () => ({
      findOrganizationTags: mocks.findOrganizationTags,
    }),
  },
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: {
    queryFn: () => Promise<unknown>;
    queryKey: unknown[];
  }) => mocks.useQuery(options),
  useQueryClient: () => ({
    setQueryData: mocks.setQueryData,
  }),
}));

vi.mock('@ui/content/admin-filters/AdminOrgBrandFilter', () => ({
  default: ({
    brand,
    onBrandChange,
    onOrganizationChange,
    organization,
  }: {
    brand: string;
    onBrandChange: (value: string) => void;
    onOrganizationChange: (value: string) => void;
    organization: string;
  }) => (
    <section>
      <div>Admin org: {organization || 'none'}</div>
      <div>Admin brand: {brand || 'none'}</div>
      <button type="button" onClick={() => onOrganizationChange('org-2')}>
        Pick Org
      </button>
      <button type="button" onClick={() => onBrandChange('brand-2')}>
        Pick Brand
      </button>
      <button type="button" onClick={() => onOrganizationChange('')}>
        Clear Org
      </button>
    </section>
  ),
}));

vi.mock('@ui/display/badge/Badge', () => ({
  default: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));

vi.mock('@ui/display/table/Table', () => ({
  default: ({
    actions,
    columns,
    emptyLabel,
    getRowKey,
    isLoading,
    items,
  }: {
    actions: Array<{
      isVisible?: (item: Record<string, unknown>) => boolean;
      onClick: (item: Record<string, unknown>) => void;
      tooltip: string;
    }>;
    columns: Array<{
      key: string;
      render?: (item: Record<string, unknown>) => ReactNode;
    }>;
    emptyLabel: string;
    getRowKey: (item: Record<string, unknown>) => string;
    isLoading?: boolean;
    items: Array<Record<string, unknown>>;
  }) => {
    if (isLoading) {
      return <div>Loading tags</div>;
    }

    if (items.length === 0) {
      return <div>{emptyLabel}</div>;
    }

    return (
      <table>
        <tbody>
          {items.map((item) => (
            <tr key={getRowKey(item)}>
              {columns.map((column) => (
                <td key={column.key}>
                  {column.render
                    ? column.render(item)
                    : String(item[column.key])}
                </td>
              ))}
              <td>
                {actions
                  .filter((action) => action.isVisible?.(item) ?? true)
                  .map((action) => (
                    <button
                      key={`${getRowKey(item)}-${action.tooltip}`}
                      type="button"
                      onClick={() => action.onClick(item)}
                    >
                      {action.tooltip} {String(item.label)}
                    </button>
                  ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  },
}));

vi.mock('@ui/lazy/modal/LazyModal', () => ({
  LazyModalTag: ({
    entityId,
    item,
    onConfirm,
  }: {
    entityId?: string;
    item?: { label?: string } | null;
    onConfirm: () => void;
  }) => (
    <div data-entity-id={entityId} data-testid="tag-modal">
      Modal item: {item?.label ?? 'none'}
      <button type="button" onClick={onConfirm}>
        Confirm Modal
      </button>
    </div>
  ),
}));

vi.mock('@ui/primitives/switch', () => ({
  Switch: ({
    isChecked,
    onChange,
  }: {
    isChecked: boolean;
    onChange: () => void;
  }) => (
    <button type="button" onClick={onChange}>
      {isChecked ? 'Active' : 'Inactive'}
    </button>
  ),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/configuration/tags/all',
  useRouter: () => ({
    replace: mocks.replace,
  }),
  useSearchParams: () => ({
    get: (key: string) => {
      if (key === 'organization') return 'org-1';
      if (key === 'brand') return 'brand-1';
      return null;
    },
    toString: () => 'organization=org-1&brand=brand-1&page=2',
  }),
}));

function makeTag(overrides: Record<string, unknown> = {}) {
  return {
    backgroundColor: '#111111',
    category: 'credential',
    description: 'Tag description',
    id: 'tag-1',
    isActive: true,
    key: 'tag_key',
    label: 'Global Tag',
    organization: null,
    textColor: '#ffffff',
    user: null,
    ...overrides,
  };
}

function mockTagsQuery(
  data = [
    makeTag(),
    makeTag({
      id: 'tag-2',
      label: 'Org Tag',
      organization: { id: 'org-1', label: 'Acme Org' },
    }),
    makeTag({
      id: 'tag-3',
      label: 'External Org Tag',
      organization: { id: 'org-2', label: 'Other Org' },
    }),
    makeTag({
      id: 'tag-4',
      isActive: false,
      label: 'Account Tag',
      user: { email: 'user@example.test' },
    }),
  ],
) {
  mocks.useQuery.mockImplementation(
    (options: { queryFn: () => Promise<unknown> }) => {
      void options.queryFn();
      return {
        data,
        error: null,
        isFetching: false,
        isLoading: false,
        refetch: mocks.refetch,
      };
    },
  );
}

describe('TagsList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.deleteTag.mockResolvedValue({ ok: true });
    mocks.findAll.mockResolvedValue([]);
    mocks.findOrganizationTags.mockResolvedValue([]);
    mocks.patch.mockResolvedValue({});
    mocks.refetch.mockResolvedValue(undefined);
    mockTagsQuery();
  });

  it('renders superadmin tags, filters by scope, and syncs admin filters to the URL', async () => {
    render(<TagsList filter="all" scope={PageScope.SUPERADMIN} />);

    expect(screen.getByText('Global Tag')).toBeInTheDocument();
    expect(screen.getByText('Org Tag')).toBeInTheDocument();
    expect(screen.getByText('Account Tag')).toBeInTheDocument();
    await waitFor(() => {
      expect(mocks.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          brand: 'brand-1',
          organization: 'org-1',
          sort: 'createdAt: -1',
        }),
      );
    });

    fireEvent.click(screen.getByRole('button', { name: 'Pick Org' }));
    expect(mocks.replace).toHaveBeenCalledWith(
      '/admin/configuration/tags/all?organization=org-2',
      { scroll: false },
    );

    fireEvent.click(screen.getByRole('button', { name: 'Pick Brand' }));
    expect(mocks.replace).toHaveBeenCalledWith(
      '/admin/configuration/tags/all?organization=org-1&brand=brand-2',
      { scroll: false },
    );
  });

  it('uses organization service queries and only exposes edit actions for owned organization tags', async () => {
    render(
      <TagsList
        filter="organization"
        scope={PageScope.ORGANIZATION}
        externalFilters={{
          format: '',
          model: '',
          provider: '',
          search: 'launch',
          sort: 'label',
          status: '',
          type: 'credential',
        }}
      />,
    );

    expect(screen.queryByText('Global Tag')).not.toBeInTheDocument();
    expect(screen.getByText('Org Tag')).toBeInTheDocument();
    expect(screen.getByText('External Org Tag')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Edit Global Tag' }),
    ).toBeNull();
    expect(screen.getByRole('button', { name: 'Edit Org Tag' })).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Edit External Org Tag' }),
    ).toBeNull();

    await waitFor(() => {
      expect(mocks.findOrganizationTags).toHaveBeenCalledWith(
        'org-1',
        expect.objectContaining({
          brand: 'brand-1',
          category: 'credential',
          search: 'launch',
          sort: 'label: 1',
        }),
      );
    });
  });

  it('toggles tag active state and updates query cache optimistically', async () => {
    render(<TagsList filter="all" scope={PageScope.SUPERADMIN} />);

    fireEvent.click(screen.getAllByRole('button', { name: 'Active' })[0]);

    await waitFor(() => {
      expect(mocks.patch).toHaveBeenCalledWith('tag-1', {
        isActive: false,
      });
      expect(mocks.notificationsSuccess).toHaveBeenCalledWith(
        'Tag deactivated',
      );
      expect(mocks.setQueryData).toHaveBeenCalled();
    });
  });

  it('opens edit and delete flows with the selected tag', async () => {
    render(<TagsList filter="all" scope={PageScope.SUPERADMIN} />);

    fireEvent.click(screen.getByRole('button', { name: 'Edit Org Tag' }));
    expect(mocks.openModal).toHaveBeenCalled();
    expect(screen.getByTestId('tag-modal')).toHaveTextContent('Org Tag');

    fireEvent.click(screen.getByRole('button', { name: 'Delete Org Tag' }));
    expect(mocks.openConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        confirmLabel: 'Delete',
        label: 'Delete Tag',
        message: expect.stringContaining('Org Tag'),
      }),
    );

    await mocks.openConfirm.mock.calls.at(-1)?.[0].onConfirm();

    expect(mocks.deleteTag).toHaveBeenCalledWith('tag-2');
    expect(mocks.notificationsSuccess).toHaveBeenCalledWith(
      'Tag deleted successfully',
    );
    expect(mocks.refetch).toHaveBeenCalled();
  });

  it('reports load, toggle, and delete failures', async () => {
    mocks.useQuery.mockReturnValue({
      data: [makeTag()],
      error: new Error('load failed'),
      isFetching: false,
      isLoading: false,
      refetch: mocks.refetch,
    });
    render(<TagsList filter="all" scope={PageScope.SUPERADMIN} />);

    await waitFor(() => {
      expect(mocks.loggerError).toHaveBeenCalledWith(
        'Failed to load tags',
        expect.any(Error),
      );
      expect(mocks.notificationsError).toHaveBeenCalledWith(
        'Failed to load tags',
      );
    });

    mocks.patch.mockRejectedValueOnce(new Error('patch failed'));
    fireEvent.click(screen.getByRole('button', { name: 'Active' }));
    await waitFor(() => {
      expect(mocks.notificationsError).toHaveBeenCalledWith(
        'Failed to update tag status',
      );
    });

    mocks.deleteTag.mockRejectedValueOnce(new Error('delete failed'));
    fireEvent.click(screen.getByRole('button', { name: 'Delete Global Tag' }));
    await mocks.openConfirm.mock.calls.at(-1)?.[0].onConfirm();
    expect(mocks.notificationsError).toHaveBeenCalledWith(
      'Failed to delete tag',
    );
  });
});
