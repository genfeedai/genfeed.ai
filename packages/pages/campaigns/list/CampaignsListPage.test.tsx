import { ContentCampaignStatus } from '@genfeedai/contracts';
import CampaignsListPage from '@pages/campaigns/list/CampaignsListPage';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';

vi.mock('@pages/campaigns/form/CampaignCreateDialog', () => ({
  default: () => <div role="dialog">Campaign setup</div>,
}));

const mockCampaigns = [
  {
    brandId: 'brand-1',
    id: 'cmp-1',
    name: 'Autumn Reveal',
    objective: 'Launch the kit',
    startDate: '2026-09-15T00:00:00.000Z',
    endDate: '2026-10-31T00:00:00.000Z',
    status: ContentCampaignStatus.DRAFT,
  },
];

const mockUseCampaigns = vi.fn(() => ({
  campaigns: mockCampaigns,
  isLoading: false,
  totalPages: 1,
}));

const mockPageScope = vi.hoisted(() => ({
  current: 'brand' as 'org' | 'brand',
}));

const mockReplace = vi.hoisted(() => vi.fn());

vi.mock('@hooks/data/campaigns/use-campaigns', () => ({
  useCampaigns: () => mockUseCampaigns(),
}));

vi.mock('@hooks/navigation/use-collection-scope/use-collection-scope', () => ({
  useCollectionScope: () => ({
    brandId: mockPageScope.current === 'brand' ? 'brand-1' : undefined,
    isReady: true,
    organizationId: 'org-1',
    pageScope: mockPageScope.current,
  }),
}));

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({
    brands: [{ id: 'brand-1', label: 'Moonrise' }],
  }),
}));

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ href: (path: string) => `/acme/demo${path}` }),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/acme/demo/publishing/campaigns',
  useRouter: () => ({ replace: mockReplace }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('@ui/layout/container/Container', () => ({
  default: ({
    children,
    label,
    right,
  }: {
    children: ReactNode;
    label: string;
    right?: ReactNode;
  }) => (
    <section>
      <h1>{label}</h1>
      {right}
      {children}
    </section>
  ),
}));

vi.mock('@ui/display/badge/Badge', () => ({
  default: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));

type MockCampaign = (typeof mockCampaigns)[number];

interface MockTableProps {
  columns: Array<{
    header: string;
    key: string;
    render?: (item: MockCampaign) => ReactNode;
  }>;
  emptyLabel?: string;
  getRowLink?: (item: MockCampaign) => { href: string; label: string };
  items: MockCampaign[];
  rowSidebar?: {
    getTitle: (item: MockCampaign) => string;
    kind: string;
    render: (item: MockCampaign) => ReactNode;
  };
}

const tableProps = vi.hoisted(() => ({
  current: undefined as MockTableProps | undefined,
}));

vi.mock('@ui/display/table/Table', () => ({
  default: (props: MockTableProps) => {
    tableProps.current = props;
    const { columns, emptyLabel, items } = props;
    return (
      <div data-testid="campaigns-table">
        {columns.map((column) => (
          <span key={column.key}>{column.header}</span>
        ))}
        {items.length === 0 ? emptyLabel : null}
        {items.map((item) => (
          <div key={item.id}>
            <span>{item.name}</span>
            {columns.map((column) => (
              <span key={`${item.id}-${column.key}`}>
                {column.render ? column.render(item) : null}
              </span>
            ))}
          </div>
        ))}
      </div>
    );
  },
}));

vi.mock('@ui/navigation/pagination/Pagination', () => ({
  default: ({
    onPageChange,
    totalPages,
  }: {
    onPageChange: (page: number) => void;
    totalPages: number;
  }) =>
    totalPages > 1 ? (
      <button type="button" onClick={() => onPageChange(99)}>
        jump-last
      </button>
    ) : null,
}));

vi.mock('@ui/primitives/select', () => ({
  Select: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  SelectItem: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  SelectValue: () => null,
}));

vi.mock('@ui/primitives/button', () => ({
  Button: ({
    children,
    asChild,
    onClick,
  }: {
    asChild?: boolean;
    onClick?: () => void;
    children?: ReactNode;
  }) =>
    asChild ? (
      children
    ) : (
      <button type="button" onClick={onClick}>
        {children}
      </button>
    ),
}));

describe('CampaignsListPage', () => {
  beforeEach(() => {
    mockReplace.mockReset();
    mockPageScope.current = 'brand';
    mockUseCampaigns.mockReturnValue({
      campaigns: mockCampaigns,
      isLoading: false,
      totalPages: 1,
    });
  });

  it('lists campaigns and opens creation in a modal', () => {
    render(<CampaignsListPage />);

    expect(screen.getByText('title')).toBeInTheDocument();
    expect(screen.getByText('Autumn Reveal')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'newCampaign' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.queryByText('columns.brand')).not.toBeInTheDocument();
  });

  it('links the name to the campaign page and summarises the row in the sidebar', () => {
    render(<CampaignsListPage />);

    const { getRowLink, rowSidebar } = tableProps.current ?? {};
    expect(getRowLink?.(mockCampaigns[0]).href).toBe(
      '/acme/demo/publishing/campaigns/cmp-1',
    );
    expect(rowSidebar?.kind).toBe('campaign');
    expect(rowSidebar?.getTitle(mockCampaigns[0])).toBe('Autumn Reveal');

    render(<>{rowSidebar?.render(mockCampaigns[0])}</>);
    const summary = screen.getByTestId('table-row-summary');
    expect(summary).toHaveTextContent('Launch the kit');
    expect(
      within(summary).getByRole('link', { name: 'openCampaign' }),
    ).toHaveAttribute('href', '/acme/demo/publishing/campaigns/cmp-1');
  });

  it('identifies the brand on organization-scoped lists', () => {
    mockPageScope.current = 'org';
    render(<CampaignsListPage />);

    expect(screen.getByText('columns.brand')).toBeInTheDocument();
    expect(screen.getByText('Moonrise')).toBeInTheDocument();
  });

  it('clamps pagination to the last page', () => {
    mockUseCampaigns.mockReturnValue({
      campaigns: mockCampaigns,
      isLoading: false,
      totalPages: 3,
    });
    render(<CampaignsListPage />);
    screen.getByRole('button', { name: 'jump-last' }).click();
    expect(mockReplace).toHaveBeenCalledWith(
      '/acme/demo/publishing/campaigns?page=3',
      { scroll: false },
    );
  });
});
