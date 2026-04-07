import {
  AssetScope,
  CredentialPlatform,
  IngredientCategory,
  IngredientStatus,
} from '@genfeedai/enums';
import type { ICredential, IIngredient } from '@genfeedai/interfaces';
import { render, screen, waitFor } from '@testing-library/react';
import ModalPostBatch from '@ui/modals/content/batch/ModalPostBatch';
import { describe, expect, it, vi } from 'vitest';

// Mock dependencies
vi.mock('@ui/modals/modal/Modal', () => ({
  default: ({ children }: any) => <div data-testid="modal">{children}</div>,
}));

vi.mock('@ui/modals/actions/ModalActions', () => ({
  default: ({ children }: any) => <div>{children}</div>,
}));

vi.mock('@helpers/ui/modal/modal.helper', () => ({
  closeModal: vi.fn(),
  isModalOpen: vi.fn(() => false),
  openModal: vi.fn(),
}));

vi.mock('@hooks/ui/use-modal-auto-open/use-modal-auto-open', () => ({
  useModalAutoOpen: vi.fn(),
}));

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({
    getToken: vi.fn(async () => 'test-token'),
  }),
}));

vi.mock('@ui/modals/content/post/ModalPostHeader', () => ({
  default: () => <div data-testid="modal-post-header" />,
}));

vi.mock('@ui/modals/content/post/ModalPostContent', () => ({
  default: () => <div data-testid="modal-post-content" />,
}));

vi.mock('@ui/modals/content/post/ModalPostFooter', () => ({
  default: () => <div data-testid="modal-post-footer" />,
}));

describe('ModalPostBatch', () => {
  const defaultProps = {
    onClose: vi.fn(),
  };

  it('renders post batch modal', () => {
    render(<ModalPostBatch {...defaultProps} />);
    expect(screen.getByTestId('modal')).toBeInTheDocument();
  });

  it('does not prompt reconnect when a connected Instagram credential has access token expiry', async () => {
    const ingredient = {
      category: IngredientCategory.IMAGE,
      hasVoted: false,
      id: 'ingredient-1',
      isDefault: false,
      isFavorite: false,
      isHighlighted: false,
      isVoteAnimating: false,
      organization: 'org-1',
      scope: AssetScope.PRIVATE,
      status: IngredientStatus.COMPLETE,
      totalChildren: 0,
      totalVotes: 0,
      user: 'user-1',
    } as unknown as IIngredient;

    const credentials = [
      {
        accessTokenExpiry: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        externalHandle: 'insta-handle',
        id: 'credential-1',
        isConnected: true,
        platform: CredentialPlatform.INSTAGRAM,
      } as unknown as ICredential,
    ];

    render(
      <ModalPostBatch
        {...defaultProps}
        ingredient={ingredient}
        credentials={credentials}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('modal-post-content')).toBeInTheDocument();
    });

    expect(screen.queryByText('Reconnect Accounts')).not.toBeInTheDocument();
  });
});
