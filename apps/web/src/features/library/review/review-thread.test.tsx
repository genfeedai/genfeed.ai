import { queryClientWrapper } from '@app-tests/query-client.harness';
import type { IIngredient } from '@genfeedai/contracts/interfaces';
import {
  MENTION_NEEDS_SHARE,
  ThreadMentionRefusedError,
} from '@genfeedai/services/management/agent-thread-messages.service';
import { render as renderInDom, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ReviewThread from './review-thread';

const mocks = vi.hoisted(() => ({
  listCandidates: vi.fn(),
  listMessages: vi.fn(),
  sendMessage: vi.fn(),
}));

vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', async () => ({
  useAuthIdentity: (await import('@app-tests/query-client.harness'))
    .useTestViewer,
}));
vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => ({
    listCandidates: mocks.listCandidates,
    listMessages: mocks.listMessages,
    sendMessage: mocks.sendMessage,
  }),
}));
vi.mock('@genfeedai/services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => ({ error: vi.fn(), success: vi.fn() }),
  },
}));
vi.mock('@/components/workspace-shell/use-agent-thread-members', () => {
  const members = [
    { name: 'Vincent', roleLabel: 'Owner', userId: 'user-1' },
    { name: 'Ana Costa', roleLabel: 'Admin', userId: 'user-2' },
    { name: 'Marco Rossi', roleLabel: 'Creator', userId: 'user-3' },
    { name: 'Lena Fischer', roleLabel: 'Analytics', userId: 'user-4' },
  ].map((member) => ({ avatarUrl: null, brandIds: [], ...member }));
  return {
    useAgentThreadMembers: () => ({
      isLoading: false,
      members,
      membersById: new Map(members.map((member) => [member.userId, member])),
    }),
  };
});
vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

function render(ui: ReactElement) {
  return renderInDom(ui, { wrapper: queryClientWrapper() });
}

const ASSET = { brandId: 'brand-a', id: 'asset-1' } as IIngredient;

describe('ReviewThread (#9948)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Ana and Marco reach the brand; Lena does not.
    mocks.listCandidates.mockResolvedValue(['user-2', 'user-3']);
    mocks.listMessages.mockResolvedValue([]);
    mocks.sendMessage.mockResolvedValue({});
  });

  it('shows who wrote each message and marks the people it tags', async () => {
    mocks.listMessages.mockResolvedValue([
      {
        content: 'Please check the tone.',
        createdAt: '2026-11-11T10:05:00Z',
        id: 'm1',
        role: 'user',
        userId: 'user-1',
      },
      {
        content: 'Claim is fine. @Marco can you confirm?',
        createdAt: '2026-11-11T10:20:00Z',
        id: 'm2',
        role: 'user',
        userId: 'user-2',
      },
    ]);

    render(<ReviewThread ingredient={ASSET} threadId="thread-1" />);

    expect(await screen.findByText('Ana Costa')).toBeInTheDocument();
    expect(screen.getByText('Vincent')).toBeInTheDocument();
    expect(screen.getByText('@Marco')).toBeInTheDocument();
  });

  it('offers only teammates who reach the brand and sends who was tagged', async () => {
    const user = userEvent.setup();
    render(<ReviewThread ingredient={ASSET} threadId="thread-1" />);

    await user.type(
      await screen.findByRole('textbox', { name: 'Reply in thread' }),
      'Can you check @',
    );

    const list = await screen.findByRole('listbox', { name: 'Teammates' });
    expect(list).toHaveTextContent('Ana Costa');
    expect(list).toHaveTextContent('Marco Rossi');
    expect(list).not.toHaveTextContent('Lena Fischer');
    expect(list).not.toHaveTextContent('Vincent');

    await user.click(screen.getByRole('button', { name: /Marco Rossi/ }));
    expect(
      screen.getByRole('textbox', { name: 'Reply in thread' }),
    ).toHaveValue('Can you check @Marco ');
    await user.type(
      screen.getByRole('textbox', { name: 'Reply in thread' }),
      'the handle?',
    );
    await user.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() =>
      expect(mocks.sendMessage).toHaveBeenCalledWith('thread-1', {
        content: 'Can you check @Marco the handle?',
        mentionedUserIds: ['user-3'],
      }),
    );
  });

  it('does not send a mention whose tag was deleted from the text', async () => {
    const user = userEvent.setup();
    render(<ReviewThread ingredient={ASSET} threadId="thread-1" />);

    const box = await screen.findByRole('textbox', { name: 'Reply in thread' });
    await user.type(box, '@An');
    await user.click(await screen.findByRole('button', { name: /Ana Costa/ }));
    await user.clear(box);
    await user.type(box, 'Never mind');
    await user.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() =>
      expect(mocks.sendMessage).toHaveBeenCalledWith('thread-1', {
        content: 'Never mind',
      }),
    );
  });

  it('offers to share the thread when a tagged teammate cannot open it, then sends with the share', async () => {
    const user = userEvent.setup();
    mocks.sendMessage.mockRejectedValueOnce(
      new ThreadMentionRefusedError(
        'Marco Rossi cannot open this thread yet. Share it with them at "Can view" to mention them.',
        MENTION_NEEDS_SHARE,
        true,
      ),
    );
    render(<ReviewThread ingredient={ASSET} threadId="thread-1" />);

    const box = await screen.findByRole('textbox', { name: 'Reply in thread' });
    await user.type(box, '@Ma');
    await user.click(
      await screen.findByRole('button', { name: /Marco Rossi/ }),
    );
    await user.click(screen.getByRole('button', { name: 'Send' }));

    expect(
      await screen.findByText(/Marco Rossi cannot open this thread yet/),
    ).toBeInTheDocument();
    expect(box).toHaveValue('@Marco ');

    await user.click(screen.getByRole('button', { name: 'Share and send' }));

    await waitFor(() =>
      expect(mocks.sendMessage).toHaveBeenLastCalledWith('thread-1', {
        content: '@Marco',
        mentionedUserIds: ['user-3'],
        shareMentioned: true,
      }),
    );
    await waitFor(() =>
      expect(screen.queryByText(/cannot open this thread yet/)).toBeNull(),
    );
  });

  it('only explains when the author cannot share the thread', async () => {
    const user = userEvent.setup();
    mocks.sendMessage.mockRejectedValueOnce(
      new ThreadMentionRefusedError(
        'Marco Rossi cannot open this thread yet. Ask the thread owner to share it with them first.',
        MENTION_NEEDS_SHARE,
        false,
      ),
    );
    render(<ReviewThread ingredient={ASSET} threadId="thread-1" />);

    await user.type(
      await screen.findByRole('textbox', { name: 'Reply in thread' }),
      '@Ma',
    );
    await user.click(
      await screen.findByRole('button', { name: /Marco Rossi/ }),
    );
    await user.click(screen.getByRole('button', { name: 'Send' }));

    expect(
      await screen.findByText(/Ask the thread owner to share it/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Share and send' }),
    ).not.toBeInTheDocument();
  });
});
