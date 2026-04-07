import { IngredientCategory } from '@genfeedai/enums';
import type { IIngredient } from '@genfeedai/interfaces';
import { render, screen } from '@testing-library/react';
import ModalIngredient from '@ui/modals/ingredients/ingredient/ModalIngredient';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

// Mock dependencies
vi.mock('@ui/overlays/entity/EntityOverlayShell', () => ({
  default: ({ children }: { children: ReactNode }) => (
    <div data-testid="entity-overlay">{children}</div>
  ),
}));

vi.mock('@ui/ingredients/detail-image/IngredientDetailImage', () => ({
  default: () => <div data-testid="ingredient-detail-image" />,
}));

vi.mock('@ui/ingredients/detail-video/IngredientDetailVideo', () => ({
  default: () => <div data-testid="ingredient-detail-video" />,
}));

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ getToken: vi.fn(), isSignedIn: true }),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => vi.fn(() => Promise.resolve({ findOne: vi.fn() })),
}));

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({ credentials: [] }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('@hooks/data/resource/use-resource/use-resource', () => ({
  useResource: () => ({ data: [], refresh: vi.fn() }),
}));

vi.mock(
  '@hooks/ui/ingredient/use-ingredient-actions/use-ingredient-actions',
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

vi.mock('@hooks/ui/use-modal-auto-open/use-modal-auto-open', () => ({
  useModalAutoOpen: vi.fn(),
}));

vi.mock('@providers/global-modals/global-modals.provider', () => ({
  useConfirmModal: () => ({ openConfirm: vi.fn() }),
  usePostModal: () => ({ openPostBatchModal: vi.fn() }),
}));

vi.mock('@services/core/clipboard.service', () => ({
  ClipboardService: { getInstance: () => ({ copyToClipboard: vi.fn() }) },
}));

vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: {
    apps: { app: 'http://localhost' },
    isDevelopment: false,
  },
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => ({ error: vi.fn(), info: vi.fn(), success: vi.fn() }),
  },
}));

vi.mock('@helpers/ui/modal/modal.helper', () => ({
  closeModal: vi.fn(),
}));

describe('ModalIngredient', () => {
  const defaultProps = {
    ingredient: null,
    onConfirm: vi.fn(),
  };

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
});
