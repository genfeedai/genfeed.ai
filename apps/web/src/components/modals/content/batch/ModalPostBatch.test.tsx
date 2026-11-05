import {
  AssetScope,
  CredentialPlatform,
  IngredientCategory,
  IngredientStatus,
} from '@genfeedai/contracts';
import type { ICredential, IIngredient } from '@genfeedai/contracts/interfaces';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import ModalPostBatch from '@/components/modals/content/batch/ModalPostBatch';

// Mock dependencies
vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return {
    useFormatter: () => ({
      dateTime: (value: Date, options?: Intl.DateTimeFormatOptions) =>
        new Intl.DateTimeFormat('en-GB', options).format(value),
    }),
    useTranslations: translateFromCatalog,
  };
});

vi.mock('@ui/modals/modal/Modal', () => ({
  default: ({
    children,
  }: import('react').ComponentProps<
    typeof import('@ui/modals/modal/Modal').default
  >) => <div data-testid="modal">{children}</div>,
}));

vi.mock('@ui/modals/actions/ModalActions', () => ({
  default: ({
    children,
  }: import('react').ComponentProps<
    typeof import('@ui/modals/actions/ModalActions').default
  >) => <div>{children}</div>,
}));

vi.mock('@genfeedai/helpers/ui/modal/modal.helper', () => ({
  closeModal: vi.fn(),
  isModalOpen: vi.fn(() => false),
  openModal: vi.fn(),
}));

vi.mock('@/hooks/ui/use-modal-auto-open/use-modal-auto-open', () => ({
  useModalAutoOpen: vi.fn(),
}));

const { mockPush } = vi.hoisted(() => ({ mockPush: vi.fn() }));

vi.mock('next/navigation', () => ({
  useParams: () => ({ brandSlug: 'brand-slug', orgSlug: 'acme' }),
  usePathname: () => '/acme/brand-slug/library/images',
  useRouter: () => ({ push: mockPush, replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@genfeedai/auth-client/react', () => ({
  useAuth: () => ({
    getToken: vi.fn(async () => 'test-token'),
  }),
}));

vi.mock('@genfeedai/hooks/media/use-authorized-media-preview', () => ({
  useAuthorizedMediaPreview: () => null,
}));

vi.mock('@/components/modals/content/post/ModalPostSetupTab', () => ({
  default: () => <p>Shared title, caption and time</p>,
}));

vi.mock('@/components/modals/content/post/ModalPostPlatformsTab', () => ({
  default: ({
    panel,
  }: import('@genfeedai/props/modals/modal.props').ModalPostPlatformsTabProps) => (
    <p>{`${panel} panel`}</p>
  ),
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

    expect(
      await screen.findByText('Shared title, caption and time'),
    ).toBeVisible();
    expect(screen.queryByText('Reconnect Accounts')).not.toBeInTheDocument();
  });

  it('shows the asset, its details and its channels on one screen', async () => {
    const ingredient = {
      category: IngredientCategory.VIDEO,
      id: 'ingredient-2',
      metadataLabel: 'Launch walkthrough',
    } as unknown as IIngredient;
    const credentials = [
      {
        accessTokenExpiry: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        externalHandle: 'genfeed',
        id: 'credential-2',
        isConnected: true,
        platform: CredentialPlatform.TIKTOK,
      } as unknown as ICredential,
    ];

    render(
      <ModalPostBatch
        {...defaultProps}
        ingredient={ingredient}
        credentials={credentials}
      />,
    );

    expect(await screen.findByText('Launch walkthrough')).toBeVisible();
    expect(screen.getByText('Shared title, caption and time')).toBeVisible();
    expect(screen.getByText('channels panel')).toBeVisible();
    expect(screen.getByRole('button', { name: /^Schedule/ })).toBeVisible();
    expect(
      screen.queryByRole('button', { name: /^Next/ }),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: /Preview/ }));

    expect(screen.getByText('preview panel')).toBeVisible();
  });
  it('sends the reconnect action to the brand accounts page', async () => {
    const ingredient = {
      category: IngredientCategory.IMAGE,
      id: 'ingredient-1',
    } as unknown as IIngredient;
    const expiredCredential = {
      accessTokenExpiry: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      externalHandle: 'insta-handle',
      externalId: 'external-1',
      id: 'credential-1',
      isConnected: true,
      platform: CredentialPlatform.INSTAGRAM,
    } as unknown as ICredential;

    render(
      <ModalPostBatch
        {...defaultProps}
        ingredient={ingredient}
        credentials={[expiredCredential]}
      />,
    );

    await userEvent.click(
      await screen.findByRole('button', { name: 'Reconnect Account' }),
    );

    expect(mockPush).toHaveBeenCalledWith('/acme/brand-slug/settings/accounts');
  });
});
