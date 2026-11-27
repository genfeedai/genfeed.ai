import '@testing-library/jest-dom/vitest';
import {
  AssetCategory,
  AssetScope,
  CredentialPlatform,
} from '@genfeedai/contracts';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BrandDetail from './brand-detail';

const mocks = vi.hoisted(() => ({
  articles: {
    articles: [
      { id: 'a-1', label: 'First article' },
      { id: 'a-2', label: 'Second article' },
    ],
    isError: false,
    isPending: false,
    total: 2,
    totalPages: 1,
  } as Record<string, unknown>,
  brandDetail: {} as Record<string, unknown>,
  reach: null as Record<string, number | null> | null,
  searchParams: new URLSearchParams(),
  handleCopy: vi.fn(),
  handleGenerateBanner: vi.fn(),
  handleGenerateLogo: vi.fn(),
  handleOpenUploadModal: vi.fn(),
  handleRefreshBrand: vi.fn(),
  handleRequestDeleteReference: vi.fn(),
  handleUpdateAccount: vi.fn(),
  loggerError: vi.fn(),
  selectLink: vi.fn(),
  setGenerateModalType: vi.fn(),
}));

function createBrandDetailState(overrides: Record<string, unknown> = {}) {
  return {
    brand: {
      defaultImageModel: 'imagen-fast',
      description: 'Brand detail description',
      id: 'brand-1',
      label: 'Brand One',
      scope: 'public',
      slug: 'brand-handle',
      text: 'System prompt text',
    },
    brandId: 'brand-1',
    connectedPlatformsCount: 2,
    deletingRefId: null,
    generateModalType: 'banner',
    handleCopy: mocks.handleCopy,
    handleGenerateBanner: mocks.handleGenerateBanner,
    handleGenerateLogo: mocks.handleGenerateLogo,
    handleOpenUploadModal: mocks.handleOpenUploadModal,
    handleRefreshBrand: mocks.handleRefreshBrand,
    handleRequestDeleteReference: mocks.handleRequestDeleteReference,
    handleUpdateAccount: mocks.handleUpdateAccount,
    hasBrandId: true,
    isGeneratingBanner: false,
    isGeneratingLogo: false,
    isLoading: false,
    isUpdating: false,
    links: [
      {
        category: 'website',
        id: 'link-1',
        label: 'Website',
        url: 'https://example.test',
      },
    ],
    selectedLink: null,
    selectLink: mocks.selectLink,
    setGenerateModalType: mocks.setGenerateModalType,
    socialConnections: [
      {
        credentialId: 'credential-1',
        handle: 'brand',
        platform: CredentialPlatform.TWITTER,
        url: 'https://x.com/brand',
      },
    ],
    ...overrides,
  };
}

vi.mock('@/hooks/pages/use-brand-detail/use-brand-detail', () => ({
  useBrandDetail: () => mocks.brandDetail,
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useParams: () => ({ brandSlug: 'brand-handle', orgSlug: 'org-one' }),
  useSearchParams: () => mocks.searchParams,
}));

vi.mock('@/features/brands/hooks/use-brand-profile-articles', () => ({
  useBrandProfileArticles: () => mocks.articles,
}));

vi.mock('@/features/brands/hooks/use-brand-reach', () => ({
  useBrandReach: () => mocks.reach,
}));

vi.mock('@/features/brands/components/articles/BrandProfileArticles', () => ({
  default: ({
    articles,
  }: {
    articles: Array<{ id: string; label: string }>;
  }) => (
    <section aria-label="Articles">
      {articles.map((article) => (
        <p key={article.id}>{article.label}</p>
      ))}
    </section>
  ),
}));

vi.mock(
  '@/features/brands/components/sidebar/BrandDetailExternalLinksCard',
  () => ({
    default: ({ links }: { links: Array<{ id: string }> }) => (
      <section aria-label="Website links">Links {links.length}</section>
    ),
  }),
);

vi.mock('@hooks/data/elements/use-elements/use-elements', () => ({
  useElements: () => ({
    imageModels: [{ cost: 9, key: 'imagen-fast' }],
  }),
}));

vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: {
    apps: {
      app: 'https://app.genfeed.test',
      website: 'https://genfeed.test',
    },
  },
}));

vi.mock('@services/core/logger.service', () => ({
  logger: {
    error: mocks.loggerError,
  },
}));

vi.mock('@ui/primitives/alert', () => ({
  Alert: ({ children }: { children: ReactNode }) => (
    <div role="alert">{children}</div>
  ),
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

vi.mock('@ui/layout/container/Container', () => ({
  default: ({
    children,
    right,
  }: {
    children: ReactNode;
    right?: ReactNode;
  }) => (
    <main>
      {right ? <div data-testid="container-right">{right}</div> : null}
      {children}
    </main>
  ),
}));

vi.mock(
  '@/features/brands/components/sidebar/BrandDetailSocialMediaCard',
  () => ({
    default: ({
      connections,
      isConnectAccountModalOpen,
      variant,
    }: {
      connections: Array<{ credentialId: string }>;
      isConnectAccountModalOpen?: boolean;
      variant?: string;
    }) => (
      <section>
        Accounts {connections.length} {variant}
        {isConnectAccountModalOpen ? <span>Connect account modal</span> : null}
      </section>
    ),
  }),
);

vi.mock('@/features/brands/components/banner/BrandDetailBanner', () => ({
  default: ({
    onGenerateBanner,
    onUploadBanner,
  }: {
    onGenerateBanner: () => void;
    onUploadBanner: () => void;
  }) => (
    <section>
      Banner
      <button type="button" onClick={onUploadBanner}>
        Upload Banner
      </button>
      <button type="button" onClick={onGenerateBanner}>
        Generate Banner
      </button>
    </section>
  ),
}));

vi.mock('@/features/brands/components/overview/BrandDetailOverview', () => ({
  default: ({
    footer,
    onGenerateLogo,
    onUpdateBrand,
    onUploadLogo,
    visibility,
  }: {
    footer?: ReactNode;
    onGenerateLogo: () => void;
    onUpdateBrand: (
      field: 'label' | 'description',
      value: string,
    ) => Promise<void>;
    onUploadLogo: () => void;
    visibility?: ReactNode;
  }) => (
    <section>
      Profile
      <button type="button" onClick={onUploadLogo}>
        Upload Logo
      </button>
      <button type="button" onClick={onGenerateLogo}>
        Generate Logo
      </button>
      <button
        type="button"
        onClick={() => void onUpdateBrand('label', 'Updated Brand')}
      >
        Update Brand Name
      </button>
      <button
        type="button"
        onClick={() => void onUpdateBrand('description', 'Updated description')}
      >
        Update Brand Description
      </button>
      {visibility}
      {footer}
    </section>
  ),
}));

vi.mock(
  '@/features/brands/components/system-prompt/BrandDetailSystemPrompt',
  () => ({
    default: ({
      onCopy,
      text,
    }: {
      onCopy: (text: string) => void;
      text: string;
    }) => (
      <button type="button" onClick={() => onCopy(text)}>
        Prompt {text}
      </button>
    ),
  }),
);

vi.mock('@/components/lazy/modal/LazyModal', () => ({
  LazyModalBrandLink: () => null,
  LazyModalBrandGenerate: ({
    brandId,
    cost,
    onConfirm,
    type,
  }: {
    brandId: string;
    cost: number;
    onConfirm: () => void;
    type: string;
  }) => (
    <button type="button" onClick={onConfirm}>
      Generate modal {type} {brandId} {cost}
    </button>
  ),
}));

describe('BrandDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.brandDetail = createBrandDetailState();
    mocks.searchParams = new URLSearchParams();
    mocks.reach = null;
    mocks.handleRefreshBrand.mockResolvedValue(undefined);
    mocks.handleUpdateAccount.mockResolvedValue(undefined);
  });

  it('renders loading and not-found states', () => {
    mocks.brandDetail = createBrandDetailState({ hasBrandId: false });
    const { rerender } = render(<BrandDetail />);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Error! Invalid brand ID.',
    );

    mocks.brandDetail = createBrandDetailState({ isLoading: true });
    rerender(<BrandDetail />);
    // Shell-first: the Container chrome renders even while data loads, only
    // the body region shows a loading placeholder.
    expect(screen.getByTestId('brand-detail-loading')).toBeInTheDocument();
    expect(screen.queryByText('Banner')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    mocks.brandDetail = createBrandDetailState({ brand: null });
    rerender(<BrandDetail />);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Error! Account not found.',
    );
  });

  it('renders the public profile surface without kit/config chrome', () => {
    render(<BrandDetail />);

    expect(screen.getByText('Banner')).toBeInTheDocument();
    expect(screen.getByText('Profile')).toBeInTheDocument();
    expect(
      screen.getByRole('region', { name: 'Articles' }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Public posts/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Latest (Videos|Images|Articles)/)).toBeNull();
    expect(screen.queryByText('Brand Kit Review')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Edit Brand' }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Upload Banner' }));
    expect(mocks.handleOpenUploadModal).toHaveBeenCalledWith(
      AssetCategory.BANNER,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Upload Logo' }));
    expect(mocks.handleOpenUploadModal).toHaveBeenCalledWith(
      AssetCategory.LOGO,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Generate Banner' }));
    expect(mocks.handleGenerateBanner).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Generate Logo' }));
    expect(mocks.handleGenerateLogo).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Update Brand Name' }));
    expect(mocks.handleUpdateAccount).toHaveBeenCalledWith(
      'label',
      'Updated Brand',
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Update Brand Description' }),
    );
    expect(mocks.handleUpdateAccount).toHaveBeenCalledWith(
      'description',
      'Updated description',
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Copy public profile link' }),
    );
    expect(mocks.handleCopy).toHaveBeenCalledWith(
      'https://genfeed.test/@brand-handle',
    );
    fireEvent.click(screen.getByRole('switch', { name: 'Public Profile' }));
    expect(mocks.handleUpdateAccount).toHaveBeenCalledWith(
      'scope',
      AssetScope.BRAND,
    );
  });

  it('has no Connect account in the top bar', () => {
    render(<BrandDetail />);

    expect(screen.queryByTestId('container-right')).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Connect account' }),
    ).toBeNull();
  });

  it('shows Articles and Settings tabs, Articles first, with no Overview', () => {
    render(<BrandDetail />);

    const tabs = within(
      screen.getByRole('navigation', { name: 'Profile sections' }),
    ).getAllByRole('link');
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      'Articles 2',
      'Settings',
    ]);
    expect(screen.getByText('First article')).toBeInTheDocument();
    expect(screen.queryByText('Accounts 1 page')).toBeNull();
  });

  it('puts the chosen tab in the URL without navigating', () => {
    window.history.replaceState(
      null,
      '',
      '/settings/profile?tab=articles&page=2',
    );
    render(<BrandDetail />);

    fireEvent.click(screen.getByRole('link', { name: 'Settings' }));

    expect(window.location.search).toBe('?tab=settings');
  });

  it('shows Articles for the old Overview link', () => {
    mocks.searchParams = new URLSearchParams('tab=overview');
    render(<BrandDetail />);

    expect(screen.getByText('Second article')).toBeInTheDocument();
    expect(screen.queryByText('Accounts 1 page')).toBeNull();
  });

  it('holds Public analytics, accounts and website links under Settings', () => {
    mocks.searchParams = new URLSearchParams('tab=settings');
    render(<BrandDetail />);

    expect(screen.queryByText('First article')).toBeNull();
    expect(screen.getByText('Accounts 1 page')).toBeInTheDocument();
    expect(
      screen.getByRole('region', { name: 'Website links' }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('switch', { name: 'Public analytics' }));
    expect(mocks.handleUpdateAccount).toHaveBeenCalledWith(
      'isPublicAnalyticsEnabled',
      false,
    );
  });

  it('shows Public analytics off once the owner turned it off', () => {
    mocks.searchParams = new URLSearchParams('tab=settings');
    mocks.brandDetail = createBrandDetailState({
      brand: {
        ...(createBrandDetailState().brand as Record<string, unknown>),
        isPublicAnalyticsEnabled: false,
      },
    });
    render(<BrandDetail />);

    expect(
      screen.getByRole('switch', { name: 'Public analytics' }),
    ).not.toBeChecked();
  });

  it('opens the Connect account modal from the Accounts header', () => {
    mocks.searchParams = new URLSearchParams('tab=settings');
    render(<BrandDetail />);

    expect(
      screen.getByRole('heading', { name: 'Accounts' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Connect account modal')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Connect account' }));

    expect(screen.getByText('Connect account modal')).toBeInTheDocument();
  });

  it('shows the reach line in the header once there is data', () => {
    mocks.reach = { engagements: 12, impressions: null, views: 1200 };
    render(<BrandDetail />);

    const summary = screen.getByTestId('metric-summary');
    expect(summary).toHaveTextContent(/1\.2K\s*views/);
    expect(summary).toHaveTextContent(/12\s*engagements/);
    expect(summary).not.toHaveTextContent('impressions');
  });

  it('keeps copy and open off until the profile is public', () => {
    mocks.brandDetail = createBrandDetailState({
      brand: {
        ...(createBrandDetailState().brand as Record<string, unknown>),
        scope: 'brand',
      },
    });
    render(<BrandDetail />);

    expect(
      screen.getByRole('switch', { name: 'Public Profile' }),
    ).not.toBeChecked();
    expect(
      screen.getByRole('button', { name: 'Copy public profile link' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'View public profile' }),
    ).toBeDisabled();
  });
});
