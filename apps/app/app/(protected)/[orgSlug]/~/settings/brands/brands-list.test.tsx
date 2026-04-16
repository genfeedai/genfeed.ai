import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BrandsList from './brands-list';
import '@testing-library/jest-dom';

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
  })),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: vi.fn(() => vi.fn()),
}));

vi.mock('@hooks/data/resource/use-resource/use-resource', () => ({
  useResource: vi.fn(() => ({
    data: mockBrands,
    isLoading: false,
    refresh: vi.fn(),
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

vi.mock('next/navigation', () => ({
  usePathname: vi.fn(() => '/brands'),
  useRouter: vi.fn(() => ({
    push: vi.fn(),
  })),
  useSearchParams: vi.fn(() => ({
    get: vi.fn(() => null),
    toString: vi.fn(() => ''),
  })),
}));

describe('BrandsList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render without crashing', () => {
    const { container } = render(<BrandsList />);
    expect(container.firstChild).toBeInTheDocument();
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
});
