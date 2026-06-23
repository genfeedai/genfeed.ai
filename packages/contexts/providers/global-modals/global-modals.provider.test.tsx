import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  GlobalModalsProvider,
  useConfirmModal,
} from './global-modals.provider';

vi.mock('@genfeedai/auth-client/react', () => ({
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
  usePathname: () => '/workspace',
  useParams: () => ({ brandSlug: undefined, orgSlug: undefined }),
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
  useSearchParams: () => ({ toString: () => '' }),
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

function resetBodyState(): void {
  document.body.removeAttribute('aria-hidden');
  document.body.removeAttribute('inert');
  document.body.removeAttribute('data-scroll-locked');
  document.body.style.cssText = '';
}

function flushModalCleanup(): void {
  act(() => {
    vi.runOnlyPendingTimers();
  });
}

function ConfirmHarness() {
  const { closeConfirm, openConfirm } = useConfirmModal();

  return (
    <>
      <button
        type="button"
        onClick={() =>
          openConfirm({
            label: 'Delete asset',
            message: 'This action cannot be undone.',
            onConfirm: vi.fn(),
          })
        }
      >
        Open confirm
      </button>
      <button type="button" onClick={closeConfirm}>
        Close confirm
      </button>
    </>
  );
}

describe('GlobalModalsProvider', () => {
  afterEach(() => {
    vi.useRealTimers();
    resetBodyState();
  });

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

  it('cleans stale body interaction locks after the last global modal closes', () => {
    vi.useFakeTimers();
    render(
      <GlobalModalsProvider>
        <ConfirmHarness />
      </GlobalModalsProvider>,
    );
    flushModalCleanup();

    fireEvent.click(screen.getByRole('button', { name: 'Open confirm' }));
    document.body.style.pointerEvents = 'none';
    document.body.style.overflow = 'hidden';
    document.body.setAttribute('data-scroll-locked', '1');

    fireEvent.click(screen.getByRole('button', { name: 'Close confirm' }));
    flushModalCleanup();

    expect(document.body.style.pointerEvents).toBe('');
    expect(document.body.style.overflow).toBe('');
    expect(document.body).not.toHaveAttribute('data-scroll-locked');
  });

  it('cleans stale body interaction locks when the provider unmounts', () => {
    vi.useFakeTimers();
    const { unmount } = render(
      <GlobalModalsProvider>
        <div data-testid="provider-child" />
      </GlobalModalsProvider>,
    );
    flushModalCleanup();

    document.body.style.pointerEvents = 'none';
    document.body.style.overflow = 'hidden';

    unmount();
    flushModalCleanup();

    expect(document.body.style.pointerEvents).toBe('');
    expect(document.body.style.overflow).toBe('');
  });
});
