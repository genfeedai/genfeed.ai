import '@testing-library/jest-dom/vitest';
import {
  AssetCategory,
  AssetScope,
  CredentialPlatform,
} from '@genfeedai/contracts';
import { fireEvent, render, screen } from '@testing-library/react';
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

vi.mock('@/features/brands/components/articles/BrandProfileArticles', () => ({
  default: ({
    articles,
    limit,
    seeAllHref,
  }: {
    articles: Array<{ id: string; label: string }>;
    limit?: number;
    seeAllHref?: string;
  }) => (
    <section aria-label="Articles">
      {articles.slice(0, limit ?? articles.length).map((article) => (
        <p key={article.id}>{article.label}</p>
      ))}
      {seeAllHref ? <a href={seeAllHref}>See all</a> : null}
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
      {right}
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
      screen.getByRole('region', { name: 'Website links' }),
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

  it('shows the connected accounts and opens the Connect account modal from the header', () => {
    render(<BrandDetail />);

    expect(screen.getByText('Accounts 1 page')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Accounts' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Connect account modal')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Connect account' }));

    expect(screen.getByText('Connect account modal')).toBeInTheDocument();
  });

  it('shows the newest articles on Overview and all of them on the Articles tab', () => {
    const { rerender } = render(<BrandDetail />);

    expect(screen.getByText('First article')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'See all' })).toHaveAttribute(
      'href',
      '?tab=articles',
    );
    expect(screen.getByRole('link', { name: /^Articles/ })).toHaveTextContent(
      'Articles 2',
    );
    expect(screen.getByText('2 articles')).toBeInTheDocument();
    expect(screen.getByText('Accounts 1 page')).toBeInTheDocument();

    mocks.searchParams = new URLSearchParams('tab=articles');
    rerender(<BrandDetail />);

    expect(screen.getByText('Second article')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'See all' })).toBeNull();
    expect(screen.queryByText('Accounts 1 page')).toBeNull();
  });

  it('keeps copy and view public off until the profile is public', () => {
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
    expect(screen.getByRole('button', { name: 'View public' })).toBeDisabled();
    expect(
      screen.getByText('Only you and your team can see this profile.'),
    ).toBeInTheDocument();
  });
});
