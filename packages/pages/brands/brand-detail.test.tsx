import BrandDetail from '@pages/brands/brand-detail';
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@hooks/pages/use-brand-detail/use-brand-detail', () => ({
  useBrandDetail: () => ({
    articles: [],
    brand: {
      defaultImageModel: null,
      description: 'Brand detail description',
      id: 'brand-1',
      label: 'Brand One',
      scope: 'brand',
      slug: 'brand-handle',
      text: '',
    },
    brandId: 'brand-1',
    connectedPlatformsCount: 0,
    deletingRefId: null,
    generateModalType: null,
    handleCopy: vi.fn(),
    handleGenerateBanner: vi.fn(),
    handleGenerateLogo: vi.fn(),
    handleOpenUploadModal: vi.fn(),
    handleRefreshBrand: vi.fn(),
    handleRequestDeleteReference: vi.fn(),
    handleUpdateAccount: vi.fn(),
    hasBrandId: true,
    images: [],
    isGeneratingBanner: false,
    isGeneratingLogo: false,
    isLoading: false,
    links: [],
    selectedLink: null,
    selectLink: vi.fn(),
    setGenerateModalType: vi.fn(),
    socialConnections: [],
    videos: [],
  }),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => () =>
    Promise.resolve({
      delete: vi.fn(),
      patch: vi.fn(),
      post: vi.fn(),
    }),
}));

vi.mock('@hooks/data/elements/use-elements/use-elements', () => ({
  useElements: () => ({
    imageModels: [],
  }),
}));

vi.mock('@providers/global-modals/global-modals.provider', () => ({
  useBrandOverlay: () => ({
    openBrandOverlay: vi.fn(),
  }),
}));

vi.mock('@pages/brands/components/banner/BrandDetailBanner', () => ({
  default: () => <div>Banner</div>,
}));

vi.mock('@pages/brands/components/overview/BrandDetailOverview', () => ({
  default: () => <div>Overview</div>,
}));

vi.mock(
  '@pages/brands/components/latest-articles/BrandDetailLatestArticles',
  () => ({
    default: () => <div>Articles</div>,
  }),
);

vi.mock(
  '@pages/brands/components/latest-images/BrandDetailLatestImages',
  () => ({
    default: () => <div>Images</div>,
  }),
);

vi.mock(
  '@pages/brands/components/latest-videos/BrandDetailLatestVideos',
  () => ({
    default: () => <div>Videos</div>,
  }),
);

vi.mock(
  '@pages/brands/components/system-prompt/BrandDetailSystemPrompt',
  () => ({
    default: () => <div>Prompt</div>,
  }),
);

vi.mock('@pages/brands/components/detail-sidebar/BrandDetailSidebar', () => ({
  default: ({ onOpenLinkModal }: { onOpenLinkModal: () => void }) => (
    <button type="button" onClick={() => onOpenLinkModal()}>
      Add Link
    </button>
  ),
}));

vi.mock('@ui/lazy/modal/LazyModal', () => ({
  LazyModalBrandGenerate: () => <div data-testid="brand-generate-modal" />,
}));

describe('BrandDetail', () => {
  it('opens the inline link editor instead of relying on the brand link modal', () => {
    render(<BrandDetail />);

    fireEvent.click(screen.getByRole('button', { name: 'Add Link' }));

    expect(screen.getByText('External Link')).toBeInTheDocument();
    expect(screen.queryByTestId('brand-link-modal')).not.toBeInTheDocument();
  });
});
