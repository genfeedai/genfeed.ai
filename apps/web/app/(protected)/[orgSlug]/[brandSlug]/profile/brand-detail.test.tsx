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
  brandDetail: {} as Record<string, unknown>,
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
    posts: [{ id: 'post-1' }, { id: 'post-2' }],
    postsStatus: 'success',
    refetchPosts: vi.fn(),
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
}));

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

vi.mock('@ui/layout/container/Container', () => ({
  default: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));

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
    onCopyPublicProfile,
    onGenerateLogo,
    onUpdateBrand,
    onUploadLogo,
  }: {
    onCopyPublicProfile?: () => void;
    onGenerateLogo: () => void;
    onUpdateBrand: (
      field: 'label' | 'description',
      value: string,
    ) => Promise<void>;
    onUploadLogo: () => void;
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
      {onCopyPublicProfile ? (
        <button type="button" onClick={onCopyPublicProfile}>
          Copy Public Profile
        </button>
      ) : null}
    </section>
  ),
}));

vi.mock('./BrandDetailPublicPosts', () => ({
  default: ({
    createHref,
    posts,
    publicHandle,
  }: {
    createHref?: string;
    posts: Array<unknown>;
    publicHandle?: string;
  }) => (
    <div>
      Public posts {posts.length} at {publicHandle ?? 'no handle'} create{' '}
      {createHref ?? 'none'}
    </div>
  ),
}));

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ href: (path: string) => `/acme${path}` }),
}));

vi.mock('@/components/shell/use-available-rail-apps', () => ({
  useIsAppAvailable: () => true,
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

vi.mock(
  '@/features/brands/components/detail-sidebar/BrandDetailSidebar',
  () => ({
    default: ({
      manageSocialHref,
      onRefreshBrand,
      onTogglePublicProfile,
    }: {
      manageSocialHref?: string;
      onRefreshBrand: () => void;
      onTogglePublicProfile: (value: boolean) => void;
    }) => (
      <section>
        Sidebar
        {manageSocialHref ? (
          <span>Manage social: {manageSocialHref}</span>
        ) : null}
        <button type="button" onClick={() => onTogglePublicProfile(false)}>
          Disable Public
        </button>
        <button type="button" onClick={onRefreshBrand}>
          Refresh Brand
        </button>
      </section>
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
    expect(screen.getByText('Sidebar')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Public posts 2 at brand-handle create https://app.genfeed.test/acme/agent/new',
      ),
    ).toBeInTheDocument();
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
      screen.getByRole('button', { name: 'Copy Public Profile' }),
    );
    expect(mocks.handleCopy).toHaveBeenCalledWith(
      'https://genfeed.test/@brand-handle',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Disable Public' }));
    expect(mocks.handleUpdateAccount).toHaveBeenCalledWith(
      'scope',
      AssetScope.BRAND,
    );
    expect(
      screen.getByText(
        'Manage social: /org-one/brand-handle/connectors/channels',
      ),
    ).toBeInTheDocument();
  });
});
