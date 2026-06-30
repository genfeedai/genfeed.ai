import '@testing-library/jest-dom/vitest';
import { CredentialPlatform } from '@genfeedai/enums';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BrandDetail from './brand-detail';

const mocks = vi.hoisted(() => ({
  brandDetail: {} as Record<string, unknown>,
  deleteLink: vi.fn(),
  getLinksService: vi.fn(),
  handleCopy: vi.fn(),
  handleGenerateBanner: vi.fn(),
  handleGenerateLogo: vi.fn(),
  handleOpenUploadModal: vi.fn(),
  handleRefreshBrand: vi.fn(),
  handleRequestDeleteReference: vi.fn(),
  handleUpdateAccount: vi.fn(),
  loggerError: vi.fn(),
  openBrandOverlay: vi.fn(),
  patchLink: vi.fn(),
  postLink: vi.fn(),
  selectLink: vi.fn(),
  setGenerateModalType: vi.fn(),
}));

function createBrandDetailState(overrides: Record<string, unknown> = {}) {
  return {
    articles: [{ id: 'article-1', title: 'Latest article' }],
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
    images: [{ id: 'image-1' }],
    isGeneratingBanner: false,
    isGeneratingLogo: false,
    isLoading: false,
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
    videos: [{ id: 'video-1' }],
    ...overrides,
  };
}

vi.mock('@hooks/pages/use-brand-detail/use-brand-detail', () => ({
  useBrandDetail: () => mocks.brandDetail,
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => mocks.getLinksService,
}));

vi.mock('@hooks/data/elements/use-elements/use-elements', () => ({
  useElements: () => ({
    imageModels: [{ cost: 9, key: 'imagen-fast' }],
  }),
}));

vi.mock('@providers/global-modals/global-modals.provider', () => ({
  useBrandOverlay: () => ({
    openBrandOverlay: mocks.openBrandOverlay,
  }),
}));

vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: {
    apps: {
      website: 'https://genfeed.test',
    },
  },
}));

vi.mock('@services/core/logger.service', () => ({
  logger: {
    error: mocks.loggerError,
  },
}));

vi.mock('@services/social/links.service', () => ({
  LinksService: {
    getInstance: vi.fn(),
  },
}));

vi.mock('@ui/feedback/alert/Alert', () => ({
  default: ({ children }: { children: ReactNode }) => (
    <div role="alert">{children}</div>
  ),
}));

vi.mock('@ui/layout/container/Container', () => ({
  default: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));

vi.mock('@ui/loading/default/Loading', () => ({
  default: () => <div>Loading brand detail</div>,
}));

vi.mock('@pages/brands/components/banner/BrandDetailBanner', () => ({
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

vi.mock('@pages/brands/components/overview/BrandDetailOverview', () => ({
  default: ({
    onCopyPublicProfile,
    onEditBrand,
    onGenerateLogo,
    onUploadLogo,
  }: {
    onCopyPublicProfile?: () => void;
    onEditBrand: () => void;
    onGenerateLogo: () => void;
    onUploadLogo: () => void;
  }) => (
    <section>
      Overview
      <button type="button" onClick={onEditBrand}>
        Edit Brand
      </button>
      <button type="button" onClick={onUploadLogo}>
        Upload Logo
      </button>
      <button type="button" onClick={onGenerateLogo}>
        Generate Logo
      </button>
      {onCopyPublicProfile ? (
        <button type="button" onClick={onCopyPublicProfile}>
          Copy Public Profile
        </button>
      ) : null}
    </section>
  ),
}));

vi.mock('@pages/brands/components/brand-kit/BrandKitReviewCard', () => ({
  default: ({ onRefreshBrand }: { onRefreshBrand: () => Promise<void> }) => (
    <section>
      Brand Kit Review
      <button type="button" onClick={() => void onRefreshBrand()}>
        Refresh Brand Kit
      </button>
    </section>
  ),
}));

vi.mock('./BrandDetailLatestArticles', () => ({
  default: ({ articles }: { articles?: Array<unknown> }) => (
    <div>Articles {articles?.length ?? 0}</div>
  ),
}));

vi.mock('./BrandDetailLatestImages', () => ({
  default: ({ images }: { images?: Array<unknown> }) => (
    <div>Images {images?.length ?? 0}</div>
  ),
}));

vi.mock('./BrandDetailLatestVideos', () => ({
  default: ({ videos }: { videos?: Array<unknown> }) => (
    <div>Videos {videos?.length ?? 0}</div>
  ),
}));

vi.mock(
  '@pages/brands/components/system-prompt/BrandDetailSystemPrompt',
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

vi.mock('@pages/brands/components/detail-sidebar/BrandDetailSidebar', () => ({
  default: ({
    onDeleteReference,
    onOpenLinkModal,
    onRefreshBrand,
    onTogglePublicProfile,
    onUploadReference,
  }: {
    onDeleteReference: (id: string) => void;
    onOpenLinkModal: (link?: {
      category?: string;
      id?: string;
      label?: string;
      url?: string;
    }) => void;
    onRefreshBrand: () => void;
    onTogglePublicProfile: (value: boolean) => void;
    onUploadReference: () => void;
  }) => (
    <section>
      Sidebar
      <button type="button" onClick={() => onOpenLinkModal()}>
        Add Link
      </button>
      <button
        type="button"
        onClick={() =>
          onOpenLinkModal({
            category: 'website',
            id: 'link-1',
            label: 'Website',
            url: 'https://example.test',
          })
        }
      >
        Edit Link
      </button>
      <button type="button" onClick={() => onTogglePublicProfile(false)}>
        Disable Public
      </button>
      <button type="button" onClick={onUploadReference}>
        Upload Reference
      </button>
      <button type="button" onClick={() => onDeleteReference('reference-1')}>
        Delete Reference
      </button>
      <button type="button" onClick={onRefreshBrand}>
        Refresh Brand
      </button>
    </section>
  ),
}));

vi.mock('@pages/brands/components/sidebar/BrandDetailLinkEditor', () => ({
  default: ({
    error,
    isEditing,
    onCancel,
    onChange,
    onDelete,
    onSubmit,
    values,
  }: {
    error: string | null;
    isEditing: boolean;
    onCancel: () => void;
    onChange: (event: { target: { name: string; value: string } }) => void;
    onDelete: () => Promise<void>;
    onSubmit: () => Promise<void>;
    values: { category: string; label: string; url: string };
  }) => (
    <section>
      <h2>{isEditing ? 'Edit link' : 'Add link'}</h2>
      {error ? <div role="alert">{error}</div> : null}
      <input
        aria-label="Link label"
        name="label"
        value={values.label}
        onChange={(event) => onChange(event)}
      />
      <input
        aria-label="Link URL"
        name="url"
        value={values.url}
        onChange={(event) => onChange(event)}
      />
      <select
        aria-label="Link category"
        name="category"
        value={values.category}
        onChange={(event) => onChange(event)}
      >
        <option value="website">website</option>
        <option value="social">social</option>
      </select>
      <button type="button" onClick={() => void onSubmit()}>
        Submit Link
      </button>
      <button type="button" onClick={() => void onDelete()}>
        Delete Link
      </button>
      <button type="button" onClick={onCancel}>
        Cancel Link
      </button>
    </section>
  ),
}));

vi.mock('@ui/lazy/modal/LazyModal', () => ({
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
    mocks.selectLink.mockImplementation((link: unknown) => {
      mocks.brandDetail = {
        ...mocks.brandDetail,
        selectedLink: link,
      };
    });
    mocks.postLink.mockResolvedValue({});
    mocks.patchLink.mockResolvedValue({});
    mocks.deleteLink.mockResolvedValue({});
    mocks.handleRefreshBrand.mockResolvedValue(undefined);
    mocks.getLinksService.mockResolvedValue({
      delete: mocks.deleteLink,
      patch: mocks.patchLink,
      post: mocks.postLink,
    });
  });

  it('renders loading and not-found states', () => {
    mocks.brandDetail = createBrandDetailState({ hasBrandId: false });
    const { rerender } = render(<BrandDetail />);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Error! Invalid brand ID.',
    );

    mocks.brandDetail = createBrandDetailState({ isLoading: true });
    rerender(<BrandDetail />);
    expect(screen.getByText('Loading brand detail')).toBeInTheDocument();

    mocks.brandDetail = createBrandDetailState({ brand: null });
    rerender(<BrandDetail />);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Error! Account not found.',
    );
  });

  it('renders brand content and delegates banner, logo, public, and reference actions', () => {
    render(<BrandDetail />);

    expect(screen.getByText('Banner')).toBeInTheDocument();
    expect(screen.getByText('Overview')).toBeInTheDocument();
    expect(screen.getByText('Brand Kit Review')).toBeInTheDocument();
    expect(screen.getByText('Videos 1')).toBeInTheDocument();
    expect(screen.getByText('Images 1')).toBeInTheDocument();
    expect(screen.getByText('Articles 1')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Upload Banner' }));
    expect(mocks.handleOpenUploadModal).toHaveBeenCalledWith('banner');
    fireEvent.click(screen.getByRole('button', { name: 'Upload Logo' }));
    expect(mocks.handleOpenUploadModal).toHaveBeenCalledWith('logo');
    fireEvent.click(screen.getByRole('button', { name: 'Upload Reference' }));
    expect(mocks.handleOpenUploadModal).toHaveBeenCalledWith('reference');
    fireEvent.click(screen.getByRole('button', { name: 'Generate Banner' }));
    expect(mocks.handleGenerateBanner).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Generate Logo' }));
    expect(mocks.handleGenerateLogo).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Edit Brand' }));
    expect(mocks.openBrandOverlay).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'brand-1' }),
      expect.any(Function),
      'edit',
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Copy Public Profile' }),
    );
    expect(mocks.handleCopy).toHaveBeenCalledWith(
      'https://genfeed.test/u/brand-handle',
    );
    fireEvent.click(screen.getByRole('button', { name: /Prompt/ }));
    expect(mocks.handleCopy).toHaveBeenCalledWith('System prompt text');
    fireEvent.click(screen.getByRole('button', { name: 'Disable Public' }));
    expect(mocks.handleUpdateAccount).toHaveBeenCalledWith('scope', 'brand');
    fireEvent.click(screen.getByRole('button', { name: 'Delete Reference' }));
    expect(mocks.handleRequestDeleteReference).toHaveBeenCalledWith(
      'reference-1',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Refresh Brand Kit' }));
    expect(mocks.handleRefreshBrand).toHaveBeenCalledWith(true);
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Generate modal banner brand-1 9',
      }),
    );
    expect(mocks.setGenerateModalType).toHaveBeenCalledWith(null);
  });

  it('creates, updates, deletes, validates, and handles failed brand links', async () => {
    render(<BrandDetail />);

    fireEvent.click(screen.getByRole('button', { name: 'Add Link' }));
    expect(screen.getByText('Add link')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Submit Link' }));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Label and URL are required.',
    );

    fireEvent.change(screen.getByLabelText('Link label'), {
      target: { name: 'label', value: 'Homepage' },
    });
    fireEvent.change(screen.getByLabelText('Link URL'), {
      target: { name: 'url', value: 'not-valid' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Submit Link' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid URL');

    fireEvent.change(screen.getByLabelText('Link URL'), {
      target: { name: 'url', value: 'https://homepage.test' },
    });
    fireEvent.change(screen.getByLabelText('Link category'), {
      target: { name: 'category', value: 'social' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Submit Link' }));

    await waitFor(() => {
      expect(mocks.postLink).toHaveBeenCalledWith({
        brand: 'brand-1',
        category: 'social',
        label: 'Homepage',
        url: 'https://homepage.test',
      });
      expect(mocks.handleRefreshBrand).toHaveBeenCalledWith(true);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Edit Link' }));
    expect(screen.getByText('Edit link')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Link label'), {
      target: { name: 'label', value: 'Updated Website' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Submit Link' }));

    await waitFor(() => {
      expect(mocks.patchLink).toHaveBeenCalledWith(
        'link-1',
        expect.objectContaining({
          label: 'Updated Website',
        }),
      );
    });

    fireEvent.click(screen.getByRole('button', { name: 'Edit Link' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete Link' }));
    await waitFor(() => {
      expect(mocks.deleteLink).toHaveBeenCalledWith('link-1');
    });

    mocks.postLink.mockRejectedValueOnce(new Error('post failed'));
    fireEvent.click(screen.getByRole('button', { name: 'Add Link' }));
    fireEvent.change(screen.getByLabelText('Link label'), {
      target: { name: 'label', value: 'Broken' },
    });
    fireEvent.change(screen.getByLabelText('Link URL'), {
      target: { name: 'url', value: 'https://broken.test' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Submit Link' }));

    await waitFor(() => {
      expect(mocks.loggerError).toHaveBeenCalledWith(
        'Failed to save brand link',
        expect.any(Error),
      );
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Failed to save link',
      );
    });
  });
});
