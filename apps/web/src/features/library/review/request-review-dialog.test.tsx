import { queryClientWrapper } from '@app-tests/query-client.harness';
import type { IIngredient } from '@genfeedai/contracts/interfaces';
import { render as renderInDom, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import RequestReviewDialog from './request-review-dialog';

const mocks = vi.hoisted(() => ({
  listCandidates: vi.fn(),
  request: vi.fn(),
}));

vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', async () => ({
  useAuthIdentity: (await import('@app-tests/query-client.harness'))
    .useTestViewer,
}));
vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => ({
    listCandidates: mocks.listCandidates,
    request: mocks.request,
  }),
}));
vi.mock('@genfeedai/services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => ({ error: vi.fn(), success: vi.fn() }),
  },
}));
vi.mock('@/components/workspace-shell/use-agent-thread-members', () => ({
  useAgentThreadMembers: () => ({
    isLoading: false,
    members: [
      {
        avatarUrl: null,
        brandIds: [],
        name: 'Vincent',
        roleLabel: 'Owner',
        userId: 'user-1',
      },
      {
        avatarUrl: null,
        brandIds: [],
        name: 'Ana Costa',
        roleLabel: 'Admin',
        userId: 'user-2',
      },
      {
        avatarUrl: null,
        brandIds: [],
        name: 'Marco Rossi',
        roleLabel: 'Creator',
        userId: 'user-3',
      },
      {
        avatarUrl: null,
        brandIds: [],
        name: 'Lena Fischer',
        roleLabel: 'Analytics',
        userId: 'user-4',
      },
    ],
    membersById: new Map(),
  }),
}));
vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

function render(ui: ReactElement) {
  return renderInDom(ui, { wrapper: queryClientWrapper() });
}

const ASSETS = [
  { brandId: 'brand-a', id: 'asset-1' },
  { brandId: 'brand-a', id: 'asset-2' },
] as IIngredient[];

describe('RequestReviewDialog (#9948)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // The server says who reaches the brand: Ana and Marco, not Lena.
    mocks.listCandidates.mockResolvedValue(['user-2', 'user-3']);
    mocks.request.mockResolvedValue([]);
  });

  it('offers teammates who reach the brand and disables the rest, never the viewer', async () => {
    render(
      <RequestReviewDialog
        ingredients={ASSETS.slice(0, 1)}
        isOpen
        onOpenChange={vi.fn()}
      />,
    );

    expect(await screen.findByText('Marco Rossi')).toBeInTheDocument();
    expect(screen.queryByText('Vincent')).not.toBeInTheDocument();
    expect(
      screen.getByRole('checkbox', { name: 'Ask Marco Rossi' }),
    ).toBeEnabled();
    expect(
      screen.getByRole('checkbox', { name: 'Ask Lena Fischer' }),
    ).toBeDisabled();
    expect(
      screen.getByText('Analytics · no access to this brand'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send request' })).toBeDisabled();
  });

  it('asks one request per asset for the chosen people, with the note', async () => {
    const onOpenChange = vi.fn();
    const user = userEvent.setup();

    render(
      <RequestReviewDialog
        ingredients={ASSETS}
        isOpen
        onOpenChange={onOpenChange}
      />,
    );
    await user.click(
      await screen.findByRole('checkbox', { name: 'Ask Marco Rossi' }),
    );
    await user.type(
      screen.getByRole('textbox', { name: 'Note' }),
      'Check the claim.',
    );
    await user.click(screen.getByRole('button', { name: 'Send request' }));

    await waitFor(() => expect(mocks.request).toHaveBeenCalledTimes(2));
    expect(mocks.request).toHaveBeenCalledWith('asset-1', {
      note: 'Check the claim.',
      reviewerUserIds: ['user-3'],
    });
    expect(mocks.request).toHaveBeenCalledWith('asset-2', {
      note: 'Check the claim.',
      reviewerUserIds: ['user-3'],
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('asks the server about one asset per brand', async () => {
    render(
      <RequestReviewDialog
        ingredients={ASSETS}
        isOpen
        onOpenChange={vi.fn()}
      />,
    );
    await screen.findByText('Marco Rossi');

    expect(mocks.listCandidates).toHaveBeenCalledTimes(1);
    expect(mocks.listCandidates).toHaveBeenCalledWith(
      'asset-1',
      expect.anything(),
    );
  });
});
