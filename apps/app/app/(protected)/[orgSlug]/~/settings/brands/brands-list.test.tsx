import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BrandsList from './brands-list';
import '@testing-library/jest-dom/vitest';

import { Brand } from '@models/organization/brand.model';

// Built through the real model so the row reads the same `logo` and
// `credentials` relations the list API returns, not hand-set getters.
const mockBrands = [
  new Brand({
    createdAt: '2024-01-01',
    credentials: [
      { id: 'c1', platform: 'instagram' },
      { id: 'c2', platform: 'tiktok' },
      { id: 'c3', platform: 'youtube' },
    ],
    id: '1',
    label: 'Test Brand',
    logo: { cdnUrl: 'https://cdn.example.com/logos/asset-1', id: 'asset-1' },
    slug: 'testbrand',
  } as never),
  new Brand({
    createdAt: '2024-01-02',
    credentials: [],
    id: '2',
    label: 'Nologo',
    slug: 'nologo',
  } as never),
];

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: vi.fn(() => ({
    organizationId: 'org-123',
    settings: { subscriptionTier: 'pro' },
  })),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: vi.fn(() => vi.fn()),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: vi.fn(() => ({
    data: mockBrands,
    isLoading: false,
    refetch: vi.fn(),
  })),
  useQueryClient: vi.fn(() => ({
    setQueryData: vi.fn(),
  })),
}));

vi.mock('@providers/global-modals/global-modals.provider', () => ({
  useBrandOverlay: vi.fn(() => ({
    openBrandOverlay: vi.fn(),
  })),
  useConfirmModal: vi.fn(() => ({
    openConfirm: vi.fn(),
  })),
}));

const pushMock = vi.fn();

vi.mock('next/navigation', () => ({
  usePathname: vi.fn(() => '/brands'),
  useRouter: vi.fn(() => ({
    push: pushMock,
  })),
  useSearchParams: vi.fn(() => ({
    get: vi.fn(() => null),
    toString: vi.fn(() => ''),
  })),
}));

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: vi.fn(() => ({
    orgSlug: 'default',
  })),
}));

vi.mock('@genfeedai/contracts/constants', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@genfeedai/contracts/constants')>();
  return {
    ...actual,
    createBrandAppRoute: vi.fn(
      (orgSlug: string, brandSlug: string, path = '') =>
        `/${orgSlug}/${brandSlug}${path}`,
    ),
  };
});

describe('BrandsList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render without crashing', () => {
    const { container } = render(<BrandsList />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('uses full-pane layout so the list chrome reaches the app borders', () => {
    const { container } = render(<BrandsList />);
    const rootElement = container.firstChild as HTMLElement;

    expect(rootElement).toHaveClass('mx-0');
    expect(rootElement).toHaveClass('max-w-none');
    expect(rootElement).not.toHaveClass('px-5');
    expect(rootElement).not.toHaveClass('max-w-[1280px]');
  });

  it('should display the page title and description', () => {
    render(<BrandsList />);
    expect(screen.getByText('Brands')).toBeInTheDocument();
    expect(screen.getByText('Manage brands and settings.')).toBeInTheDocument();
  });

  it('should render add brand button', () => {
    render(<BrandsList />);
    expect(screen.getByText('Add Brand')).toBeInTheDocument();
  });

  it('should display brand data in table', () => {
    render(<BrandsList />);
    expect(screen.getByText('Test Brand')).toBeInTheDocument();
    expect(screen.getByText('@testbrand')).toBeInTheDocument();
    expect(screen.getByText('3 connected')).toBeInTheDocument();
  });

  it('shows the brand logo, or the brand initial when none is uploaded', () => {
    render(<BrandsList />);

    expect(screen.getByAltText('Test Brand')).toHaveAttribute(
      'src',
      expect.stringContaining('cdn.example.com'),
    );
    expect(screen.getByText('N')).toBeInTheDocument();
    expect(screen.getByText('0 connected')).toBeInTheDocument();
  });

  it('requests the organization by the query param the API accepts', async () => {
    const { useQuery } = await import('@tanstack/react-query');
    const { useAuthedService } = await import(
      '@hooks/auth/use-authed-service/use-authed-service'
    );
    const findAll = vi.fn().mockResolvedValue([]);
    vi.mocked(useAuthedService).mockReturnValue((async () => ({
      findAll,
    })) as never);
    render(<BrandsList />);

    const [options] = vi.mocked(useQuery).mock.calls[0] as unknown as [
      { queryFn: () => Promise<unknown> },
    ];
    await options.queryFn();

    // `organization` is not a declared query field and is stripped by the API.
    expect(findAll).toHaveBeenCalledWith({
      limit: 20,
      organizationId: 'org-123',
      page: 1,
    });
  });

  it('links the row to brand settings instead of the edit overlay', () => {
    render(<BrandsList />);

    // A real anchor, not a click handler: the router prefetches the
    // settings route before the click and cmd-click opens it in a new tab.
    expect(
      screen.getByRole('link', { name: 'Open Test Brand settings' }),
    ).toHaveAttribute('href', '/default/testbrand/settings');
  });
});
