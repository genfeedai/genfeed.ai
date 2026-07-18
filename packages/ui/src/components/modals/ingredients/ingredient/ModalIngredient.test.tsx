import { IngredientCategory } from '@genfeedai/enums';
import type { IIngredient } from '@genfeedai/interfaces';
import { fireEvent, render, screen } from '@testing-library/react';
import ModalIngredient from '@ui/modals/ingredients/ingredient/ModalIngredient';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const navigation = vi.hoisted(() => ({
  push: vi.fn(),
}));
const featureFlags = vi.hoisted(() => ({
  studio: true,
}));

// Mock dependencies
vi.mock('@ui/overlays/entity/EntityOverlayShell', () => ({
  default: ({ children }: { children: ReactNode }) => (
    <div data-testid="entity-overlay">{children}</div>
  ),
}));

vi.mock('@ui/ingredients/detail-image/IngredientDetailImage', () => ({
  default: ({
    image,
    onCreateVariation,
    onUsePrompt,
  }: {
    image: IIngredient;
    onCreateVariation?: (ingredient: IIngredient) => void;
    onUsePrompt?: (ingredient: IIngredient) => void;
  }) => (
    <div data-testid="ingredient-detail-image">
      <button type="button" onClick={() => onCreateVariation?.(image)}>
        Remix selected image
      </button>
      <button type="button" onClick={() => onUsePrompt?.(image)}>
        Use selected prompt
      </button>
    </div>
  ),
}));

vi.mock('@ui/ingredients/detail-video/IngredientDetailVideo', () => ({
  default: () => <div data-testid="ingredient-detail-video" />,
}));

vi.mock('@genfeedai/auth-client/react', () => ({
  useAuth: () => ({ getToken: vi.fn(), isSignedIn: true }),
}));

vi.mock('@genfeedai/hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => vi.fn(() => Promise.resolve({ findOne: vi.fn() })),
}));

vi.mock('@genfeedai/hooks/feature-flags/use-feature-flag', () => ({
  useFeatureFlag: (flagKey: string) =>
    flagKey === 'studio' ? featureFlags.studio : true,
}));

vi.mock('@genfeedai/contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({ credentials: [] }),
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({
    brandSlug: 'acme-brand',
    orgSlug: 'acme-org',
  }),
  useRouter: () => ({ push: navigation.push, refresh: vi.fn() }),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: vi.fn(() => ({
    data: [],
    error: null,
    isFetching: false,
    isLoading: false,
    refetch: vi.fn(),
  })),
}));

vi.mock(
  '@genfeedai/hooks/ui/ingredient/use-ingredient-actions/use-ingredient-actions',
  () => ({
    useIngredientActions: () => ({
      clearUpscaleConfirm: vi.fn(),
      executeUpscale: vi.fn(),
      handlers: {
        handleClone: vi.fn(),
        handleDownload: vi.fn(),
        handlePublish: vi.fn(),
        handleShare: vi.fn(),
        handleUpdateMetadata: vi.fn(),
        handleUpdateSharing: vi.fn(),
      },
      loadingStates: {},
      upscaleConfirmData: null,
    }),
  }),
);

vi.mock('@genfeedai/hooks/ui/use-modal-auto-open/use-modal-auto-open', () => ({
  useModalAutoOpen: vi.fn(),
}));

vi.mock(
  '@genfeedai/contexts/providers/global-modals/global-modals.provider',
  () => ({
    useConfirmModal: () => ({ openConfirm: vi.fn() }),
    usePostModal: () => ({ openPostBatchModal: vi.fn() }),
  }),
);

vi.mock('@genfeedai/services/core/clipboard.service', () => ({
  ClipboardService: { getInstance: () => ({ copyToClipboard: vi.fn() }) },
}));

vi.mock('@genfeedai/services/core/environment.service', () => ({
  EnvironmentService: {
    apps: { app: 'http://localhost' },
    isDevelopment: false,
  },
}));

vi.mock('@genfeedai/services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => ({ error: vi.fn(), info: vi.fn(), success: vi.fn() }),
  },
}));

vi.mock('@genfeedai/helpers/ui/modal/modal.helper', () => ({
  closeModal: vi.fn(),
}));

describe('ModalIngredient', () => {
  const defaultProps = {
    ingredient: null,
    onConfirm: vi.fn(),
  };

  beforeEach(() => {
    featureFlags.studio = true;
    navigation.push.mockClear();
  });

  it('renders ingredient modal', () => {
    render(<ModalIngredient {...defaultProps} />);
    expect(screen.getByTestId('entity-overlay')).toBeInTheDocument();
  });

  it('renders the video detail workspace for video ingredients', () => {
    const ingredient = {
      category: IngredientCategory.VIDEO,
      id: 'video-ingredient',
      metadata: {},
    } as IIngredient;

    render(<ModalIngredient {...defaultProps} ingredient={ingredient} />);

    expect(screen.getByTestId('ingredient-detail-video')).toBeInTheDocument();
  });

  it('renders the image detail workspace for image ingredients', () => {
    const ingredient = {
      category: IngredientCategory.IMAGE,
      id: 'image-ingredient',
      metadata: {},
    } as IIngredient;

    render(<ModalIngredient {...defaultProps} ingredient={ingredient} />);

    expect(screen.getByTestId('ingredient-detail-image')).toBeInTheDocument();
  });

  it('opens a version-pinned contextual Remix for the selected image', () => {
    const ingredient = {
      category: IngredientCategory.IMAGE,
      id: 'image-ingredient',
      metadata: {},
      version: 7,
    } as IIngredient;

    render(<ModalIngredient {...defaultProps} ingredient={ingredient} />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Remix selected image' }),
    );

    expect(navigation.push).toHaveBeenCalledWith(
      '/acme-org/acme-brand/posts/remix?sourceArtifact=ingredient%3Aimage-ingredient&sourceVersion=7',
    );
  });

  it('hands prompts to Agent instead of disabled Studio', () => {
    featureFlags.studio = false;
    const ingredient = {
      category: IngredientCategory.IMAGE,
      id: 'image-ingredient',
      metadata: {},
      promptText: 'A launch visual',
    } as IIngredient;

    render(<ModalIngredient {...defaultProps} ingredient={ingredient} />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Use selected prompt' }),
    );

    expect(navigation.push).toHaveBeenCalledWith(
      '/acme-org/acme-brand/agent/new?prompt=A+launch+visual',
    );
  });
});
