import { queryClientWrapper } from '@app-tests/query-client.harness';
import { LibraryReviewState } from '@genfeedai/contracts';
import type { IIngredient } from '@genfeedai/contracts/interfaces';
import { render as renderInDom, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import IngredientReviewPanel from './ingredient-review-panel';

const mocks = vi.hoisted(() => ({
  approve: vi.fn(),
  listForIngredient: vi.fn(),
  listMessages: vi.fn(),
  requestChanges: vi.fn(),
}));

vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', async () => ({
  useAuthIdentity: (await import('@app-tests/query-client.harness'))
    .useTestViewer,
}));
vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => ({
    approve: mocks.approve,
    listCandidates: async () => [],
    listForIngredient: mocks.listForIngredient,
    listMessages: mocks.listMessages,
    requestChanges: mocks.requestChanges,
  }),
}));
vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ href: (path: string) => `/acme/brand${path}` }),
}));
vi.mock('@/components/workspace-shell/use-agent-thread-members', () => ({
  useAgentThreadMembers: () => ({
    isLoading: false,
    members: [],
    membersById: new Map([
      [
        'user-1',
        {
          avatarUrl: null,
          brandIds: [],
          name: 'Vincent',
          roleLabel: 'Owner',
          userId: 'user-1',
        },
      ],
      [
        'user-2',
        {
          avatarUrl: null,
          brandIds: [],
          name: 'Marco Rossi',
          roleLabel: 'Creator',
          userId: 'user-2',
        },
      ],
    ]),
  }),
}));
vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

function render(ui: ReactElement) {
  return renderInDom(ui, { wrapper: queryClientWrapper() });
}

const ASSET = { id: 'asset-1' } as IIngredient;

function request(
  overrides: Partial<{
    assigneeUserId: string;
    id: string;
    planningThreadId: string;
    requestedChangesReason: string;
    reviewState: string;
    userId: string;
  }>,
) {
  return {
    assigneeUserId: 'user-2',
    id: 'task-1',
    planningThreadId: 'thread-1',
    reviewState: 'pending_approval',
    userId: 'user-1',
    ...overrides,
  };
}

describe('IngredientReviewPanel (#9948)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.approve.mockResolvedValue({});
    mocks.listMessages.mockResolvedValue([]);
    mocks.requestChanges.mockResolvedValue({});
  });

  it('shows who was asked, where each stands, and links to their thread', async () => {
    mocks.listForIngredient.mockResolvedValue([
      request({ reviewState: 'approved' }),
      request({
        assigneeUserId: 'user-3',
        id: 'task-2',
        planningThreadId: 'thread-2',
        requestedChangesReason: 'Too cold. Warm the grade.',
        reviewState: 'changes_requested',
      }),
    ]);

    render(<IngredientReviewPanel ingredient={ASSET} />);

    expect(await screen.findByText('Marco Rossi')).toBeInTheDocument();
    expect(screen.getByText('Too cold. Warm the grade.')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Open thread with Marco Rossi' }),
    ).toHaveAttribute('href', '/acme/brand/agent/thread-1');
    // One reviewer asked for changes, so the asset as a whole needs changes.
    expect(screen.getAllByText('Changes requested').length).toBeGreaterThan(0);
  });

  it('opens the thread with the requester in the panel when the viewer was asked', async () => {
    mocks.listForIngredient.mockResolvedValue([
      request({ assigneeUserId: 'user-1', userId: 'user-2' }),
    ]);
    mocks.listMessages.mockResolvedValue([
      {
        content: 'Please check the 14-day claim.',
        createdAt: '2026-11-11T10:05:00Z',
        id: 'm1',
        role: 'user',
        userId: 'user-2',
      },
    ]);

    render(<IngredientReviewPanel ingredient={ASSET} />);

    expect(
      await screen.findByText('Please check the 14-day claim.'),
    ).toBeInTheDocument();
    expect(mocks.listMessages).toHaveBeenCalledWith(
      'thread-1',
      expect.anything(),
    );
    expect(screen.getByText('Thread with Marco Rossi')).toBeInTheDocument();
    expect(
      screen.getByRole('textbox', { name: 'Reply in thread' }),
    ).toBeInTheDocument();
  });

  it('leaves dismissed requests out and falls back to the asset state with no requests', async () => {
    mocks.listForIngredient.mockResolvedValue([
      request({ reviewState: 'dismissed' }),
    ]);

    render(
      <IngredientReviewPanel
        ingredient={
          {
            id: 'asset-1',
            reviewState: LibraryReviewState.APPROVED,
          } as IIngredient
        }
      />,
    );

    expect(await screen.findByText('Approved')).toBeInTheDocument();
    expect(screen.queryByText('Marco Rossi')).not.toBeInTheDocument();
  });

  it('lets a reviewer who was asked approve with one click', async () => {
    mocks.listForIngredient.mockResolvedValue([
      request({ assigneeUserId: 'user-1', userId: 'user-2' }),
    ]);
    const user = userEvent.setup();

    render(<IngredientReviewPanel ingredient={ASSET} />);
    await user.click(await screen.findByRole('button', { name: 'Approve' }));

    await waitFor(() => expect(mocks.approve).toHaveBeenCalledWith('task-1'));
    expect(
      screen.getByText('Marco Rossi asked you to review this.'),
    ).toBeInTheDocument();
  });

  it('asks the reviewer for a comment before sending changes', async () => {
    mocks.listForIngredient.mockResolvedValue([
      request({ assigneeUserId: 'user-1', userId: 'user-2' }),
    ]);
    const user = userEvent.setup();

    render(<IngredientReviewPanel ingredient={ASSET} />);
    await user.click(
      await screen.findByRole('button', { name: 'Request changes' }),
    );
    expect(screen.getByRole('button', { name: 'Send changes' })).toBeDisabled();

    await user.type(
      screen.getByRole('textbox', { name: 'What should change' }),
      'Warm the grade.',
    );
    await user.click(screen.getByRole('button', { name: 'Send changes' }));

    await waitFor(() =>
      expect(mocks.requestChanges).toHaveBeenCalledWith(
        'task-1',
        'Warm the grade.',
      ),
    );
  });

  it('does not offer a decision to the person who asked', async () => {
    mocks.listForIngredient.mockResolvedValue([request({})]);

    render(<IngredientReviewPanel ingredient={ASSET} />);
    await screen.findByText('Marco Rossi');

    expect(
      screen.queryByRole('button', { name: 'Approve' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Request review' }),
    ).toBeInTheDocument();
  });
});
