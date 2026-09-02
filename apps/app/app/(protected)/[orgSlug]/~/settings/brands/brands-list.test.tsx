import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BrandsList from './brands-list';
import '@testing-library/jest-dom/vitest';

const mockBrands = [
  {
    createdAt: '2024-01-01',
    id: '1',
    label: 'Test Brand',
    logoUrl: 'https://example.com/logo.png',
    slug: 'testbrand',
    totalCredentials: 3,
  },
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

  it('links the row to brand settings instead of the edit overlay', () => {
    render(<BrandsList />);

    // A real anchor, not a click handler: the router prefetches the
    // settings route before the click and cmd-click opens it in a new tab.
    expect(
      screen.getByRole('link', { name: 'Open Test Brand settings' }),
    ).toHaveAttribute('href', '/default/testbrand/settings');
  });
});
