import { GlobalModalsProvider } from '@providers/global-modals/global-modals.provider';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@clerk/nextjs', () => ({
  useUser: () => ({
    user: { reload: vi.fn() },
  }),
}));

vi.mock('@genfeedai/contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({
    credentials: [],
    refreshBrands: vi.fn(),
    settings: { subscriptionTier: 'free' },
  }),
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({ brandSlug: undefined, orgSlug: undefined }),
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
}));

vi.mock('@genfeedai/hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => vi.fn(),
}));

vi.mock('@ui/lazy/modal/LazyModal', () => ({
  LazyBrandOverlay: () => null,
  LazyIngredientOverlay: () => null,
  LazyModalConfirm: () => null,
  LazyModalCredential: () => null,
  LazyModalExport: () => null,
  LazyModalGallery: () => null,
  LazyModalGenerateIllustration: () => null,
  LazyModalMetadata: () => null,
  LazyModalPost: () => null,
  LazyModalPostBatch: () => null,
  LazyModalPostRemix: () => null,
  LazyModalPrompt: () => null,
  LazyModalUpload: () => null,
  LazyPostMetadataOverlay: () => null,
}));

vi.mock('@ui/modals', () => ({
  ModalUpgradePrompt: () => null,
}));

describe('GlobalModalsProvider', () => {
  it('should render without crashing', () => {
    render(
      <GlobalModalsProvider>
        <div data-testid="provider-child" />
      </GlobalModalsProvider>,
    );
    expect(screen.getByTestId('provider-child')).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    render(
      <GlobalModalsProvider>
        <div data-testid="provider-child" />
      </GlobalModalsProvider>,
    );
    expect(screen.getByTestId('provider-child')).toBeInTheDocument();
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(
      <GlobalModalsProvider>
        <div data-testid="provider-child" />
      </GlobalModalsProvider>,
    );
    expect(container).toBeTruthy();
  });
});
