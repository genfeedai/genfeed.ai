import { ContentCampaignStatus } from '@genfeedai/enums';
import CampaignsListPage from '@pages/campaigns/list/CampaignsListPage';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';

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
  useRouter: () => ({ replace: vi.fn() }),
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

vi.mock('@ui/display/table/Table', () => ({
  default: ({
    columns,
    emptyLabel,
    items,
  }: {
    columns: Array<{
      header: string;
      key: string;
      render?: (item: (typeof mockCampaigns)[number]) => ReactNode;
    }>;
    emptyLabel?: string;
    items: typeof mockCampaigns;
  }) => (
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
  ),
}));

vi.mock('@ui/navigation/pagination/auto-pagination/AutoPagination', () => ({
  default: () => null,
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
  }: {
    asChild?: boolean;
    children?: ReactNode;
  }) => (asChild ? children : <button type="button">{children}</button>),
}));

describe('CampaignsListPage', () => {
  beforeEach(() => {
    mockPageScope.current = 'brand';
    mockUseCampaigns.mockReturnValue({
      campaigns: mockCampaigns,
      isLoading: false,
      totalPages: 1,
    });
  });

  it('lists campaigns and links into the create flow', () => {
    render(<CampaignsListPage />);

    expect(screen.getByText('title')).toBeInTheDocument();
    expect(screen.getByText('Autumn Reveal')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'newCampaign' })).toHaveAttribute(
      'href',
      '/acme/demo/publishing/campaigns/new',
    );
    expect(screen.queryByText('columns.brand')).not.toBeInTheDocument();
  });

  it('identifies the brand on organization-scoped lists', () => {
    mockPageScope.current = 'org';
    render(<CampaignsListPage />);

    expect(screen.getByText('columns.brand')).toBeInTheDocument();
    expect(screen.getByText('Moonrise')).toBeInTheDocument();
  });
});
