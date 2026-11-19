import type { AgentThread, AgentThreadShare } from '@genfeedai/agent';
import type { AgentChatMessage } from '@genfeedai/agent/models/agent-chat.model';
import {
  AgentThreadAccessLevel,
  AgentThreadShareLevel,
  AgentThreadShareScope,
  AgentThreadStatus,
  AgentTransferDeliveryMode,
  AgentTransferStatus,
} from '@genfeedai/contracts';
import type { IAgentTransfer } from '@genfeedai/contracts/interfaces';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentThreadMember } from '@/components/workspace-shell/props/agent-threads-panel.props';
import AgentThreadsPanel from './AgentThreadsPanel';

const ME = 'user-me';
const ANA = 'user-ana';
const MARCO = 'user-marco';

const members: AgentThreadMember[] = [
  {
    avatarUrl: null,
    brandIds: ['brand-a'],
    name: 'Vincent Owner',
    roleKey: 'owner',
    roleLabel: 'Owner',
    userId: ME,
  },
  {
    avatarUrl: null,
    brandIds: ['brand-a'],
    name: 'Ana Costa',
    roleKey: 'admin',
    roleLabel: 'Admin',
    userId: ANA,
  },
  {
    avatarUrl: null,
    brandIds: ['brand-a'],
    name: 'Marco Rossi',
    roleKey: 'creator',
    roleLabel: 'Creator',
    userId: MARCO,
  },
];

// What the members transport serves; each test sets it before rendering. The
// real roster hook runs on top of it, so loading, failure and retry come from
// the query the dialog actually uses.
const roster = vi.hoisted(() => ({
  gate: null as null | Promise<void>,
  isFailed: false,
  rows: null as null | AgentThreadMember[],
}));

vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => ({
    getToken: async () => 'token',
    orgId: 'org-1',
    sessionId: 'session-1',
    userId: 'user-me',
  }),
}));

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({ organizationId: 'org-1' }),
}));

vi.mock('@services/organization/members.service', () => ({
  MembersService: {
    getInstance: () => ({
      findAllPages: async () => {
        if (roster.gate) {
          await roster.gate;
        }
        if (roster.isFailed) {
          throw new Error('members unavailable');
        }
        return (roster.rows ?? members).map((member) => ({
          brands: member.brandIds.map((id) => ({ id })),
          isActive: true,
          isDeleted: false,
          roleKey: member.roleKey,
          roleLabel: member.roleLabel,
          user: { avatar: member.avatarUrl },
          userFullName: member.name,
          userId: member.userId,
        }));
      },
    }),
  },
}));

const urlStore = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  const state = { search: '' };
  return {
    get: () => state.search,
    set: (search: string) => {
      state.search = search;
      for (const listener of listeners) {
        listener();
      }
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
});

// The URL is the owner filter's state, so the mock keeps one the panel can
// write to and re-read.
vi.mock('next/navigation', async () => {
  const { useSyncExternalStore } = await import('react');
  return {
    usePathname: () => '/acme/~/agent',
    useRouter: () => ({
      replace: (url: string) => urlStore.set(url.split('?')[1] ?? ''),
    }),
    useSearchParams: () =>
      new URLSearchParams(
        useSyncExternalStore(urlStore.subscribe, urlStore.get, urlStore.get),
      ),
  };
});

vi.mock('@genfeedai/agent/components/AgentChatInput', async () => {
  const { Textarea } = await import('@ui/primitives/textarea');
  return {
    AgentChatInput: ({ disabled }: { disabled?: boolean }) => (
      <Textarea aria-label="Message" isDisabled={disabled} />
    ),
  };
});

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../tests/next-intl.stub'
  );
  return { useLocale: () => 'en-US', useTranslations: translateFromCatalog };
});

function makeThread(
  id: string,
  title: string,
  overrides: Partial<AgentThread> = {},
): AgentThread {
  return {
    contextVersion: 3,
    createdAt: '2026-10-29T08:00:00Z',
    id,
    status: AgentThreadStatus.ACTIVE,
    title,
    updatedAt: '2026-10-29T08:00:00Z',
    ...overrides,
  };
}

const ownThread = makeThread('own', 'Serum launch captions', {
  accessLevel: AgentThreadAccessLevel.OWNER,
  attentionState: 'updated',
  brandId: 'brand-a',
  brandLabel: 'Acme Skincare',
  canManageShares: true,
  userId: ME,
});
const viewThread = makeThread('view', 'Weekly performance recap', {
  accessLevel: AgentThreadAccessLevel.VIEW,
  pendingInputCount: 1,
  canManageShares: false,
  userId: ANA,
});
const promptThread = makeThread('prompt', 'Bundle video hooks', {
  accessLevel: AgentThreadAccessLevel.COLLABORATE,
  runStatus: 'running',
  canManageShares: false,
  userId: MARCO,
});
// A hand-off Ana sent to this viewer: a thread of theirs with the request in it.
const handoffThread = makeThread('handoff', 'Review the queued post', {
  accessLevel: AgentThreadAccessLevel.OWNER,
  attentionState: 'updated',
  brandId: 'brand-a',
  canManageShares: true,
  userId: ME,
});
const threads = [ownThread, viewThread, promptThread, handoffThread];

const handoffMessages: AgentChatMessage[] = [
  {
    content: 'Review the queued post and tighten the hook.',
    createdAt: '2026-10-29T08:01:00Z',
    id: 'h1',
    metadata: {
      agentTransfer: {
        direction: 'inbound',
        transfer: {
          content: 'Review the queued post and tighten the hook.',
          createdAt: '2026-10-29T08:01:00Z',
          deliveryMode: AgentTransferDeliveryMode.SEND_AND_RUN,
          destinationThreadId: 'handoff',
          destinationUserId: ME,
          direction: 'inbound',
          id: 'transfer-9',
          progress: 0,
          retryCount: 0,
          sourceThreadId: 'ana-thread',
          status: AgentTransferStatus.AWAITING_ACCEPTANCE,
          userId: ANA,
        },
        transferId: 'transfer-9',
      },
    },
    role: 'system',
    threadId: 'handoff',
  },
];

const sharedMessages: AgentChatMessage[] = [
  {
    content: 'Pull last week’s top posts.',
    createdAt: '2026-10-29T08:01:00Z',
    id: 'm1',
    role: 'user',
    threadId: 'view',
    userId: ANA,
  },
  {
    content: 'Reels with a before/after opener won.',
    createdAt: '2026-10-29T08:02:00Z',
    id: 'm2',
    role: 'assistant',
    threadId: 'view',
  },
  {
    content: 'Here is the plan.',
    createdAt: '2026-10-29T08:03:00Z',
    id: 'm3',
    metadata: {
      proposedPlan: {
        content: '1. Pull the posts\n2. Write the recap',
        createdAt: '2026-10-29T08:03:00Z',
        id: 'plan-1',
        status: 'awaiting_approval',
        updatedAt: '2026-10-29T08:03:00Z',
      },
    },
    role: 'assistant',
    threadId: 'view',
  },
];

// A share store the API stand-in reads and writes, so the dialog shows what a
// real server would hold after each change.
let liveShares: AgentThreadShare[] = [];

function buildTransfer(status: AgentTransferStatus): IAgentTransfer {
  return {
    content: 'Review the queued post and tighten the hook.',
    correlationId: 'correlation-9',
    createdAt: '2026-10-29T08:01:00Z',
    deliveryMode: AgentTransferDeliveryMode.SEND_AND_RUN,
    depth: 1,
    destinationThreadId: 'handoff',
    destinationUserId: ME,
    id: 'transfer-9',
    idempotencyKey: 'key-9',
    organization: 'org-1',
    progress: 0,
    retryCount: 0,
    sourceThreadId: 'ana-thread',
    status,
    updatedAt: '2026-10-29T08:01:00Z',
    user: ANA,
    userId: ANA,
  };
}

const apiService = {
  acceptAgentTransfer: vi.fn(async () =>
    buildTransfer(AgentTransferStatus.PENDING),
  ),
  chatStream: vi.fn(),
  createAgentHandoff: vi.fn(async () =>
    buildTransfer(AgentTransferStatus.AWAITING_ACCEPTANCE),
  ),
  createThreadShare: vi.fn(
    async (
      threadId: string,
      payload: Pick<AgentThreadShare, 'level' | 'scope'> & {
        targetUserId?: string;
      },
    ): Promise<AgentThreadShare> => {
      const share: AgentThreadShare = {
        id: `share-${liveShares.length + 1}`,
        targetUserId: payload.targetUserId ?? null,
        threadId,
        ...payload,
      };
      liveShares = [...liveShares, share];
      return share;
    },
  ),
  deleteThreadShare: vi.fn(async (_threadId: string, shareId: string) => {
    liveShares = liveShares.filter((share) => share.id !== shareId);
  }),
  declineAgentTransfer: vi.fn(async () =>
    buildTransfer(AgentTransferStatus.DECLINED),
  ),
  getMessages: vi.fn(async (threadId: string) =>
    threadId === 'handoff' ? handoffMessages : sharedMessages,
  ),
  getThreadShares: vi.fn(
    async (_threadId: string): Promise<AgentThreadShare[]> => liveShares,
  ),
  respondToUiAction: vi.fn(),
};

function renderWithQuery(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { gcTime: 0, retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>,
  );
}

function renderPanel() {
  return renderWithQuery(
    <AgentThreadsPanel
      apiService={apiService}
      getThreadHref={(threadId) => `/acme/~/agent/${threadId}`}
      threads={threads}
    />,
  );
}

async function pickOwner(
  user: ReturnType<typeof userEvent.setup>,
  name: string,
) {
  await user.click(screen.getByRole('button', { name: /^Filters/ }));
  (await screen.findByRole('menuitem', { name: /Owner/ })).focus();
  await user.keyboard('{ArrowRight}');
  await user.click(await screen.findByRole('menuitemradio', { name }));
  await user.keyboard('{Escape}{Escape}');
}

describe('AgentThreadsPanel sharing', () => {
  // Radix Select reads pointer APIs jsdom does not implement.
  beforeAll(() => {
    for (const key of [
      'hasPointerCapture',
      'setPointerCapture',
      'releasePointerCapture',
      'scrollIntoView',
    ] as const) {
      Object.defineProperty(Element.prototype, key, {
        configurable: true,
        value: key === 'hasPointerCapture' ? () => false : () => undefined,
        writable: true,
      });
    }
  });

  beforeEach(() => {
    liveShares = [];
    roster.gate = null;
    roster.isFailed = false;
    roster.rows = null;
    apiService.getThreadShares.mockImplementation(async () => liveShares);
    apiService.deleteThreadShare.mockClear();
    apiService.getMessages.mockImplementation(async (threadId: string) =>
      threadId === 'handoff' ? handoffMessages : sharedMessages,
    );
    urlStore.set('');
  });

  it('names the owner of a thread shared with the viewer in its row', async () => {
    renderPanel();

    await waitFor(() =>
      expect(
        screen.getByRole('link', { name: /Weekly performance recap/ }),
      ).toHaveTextContent('Ana Costa'),
    );
    expect(
      screen.getByRole('link', { name: /Serum launch captions/ }),
    ).not.toHaveTextContent('Ana Costa');
  });

  it('says what each owned thread is shared with in its row, and nothing for a private or received one', () => {
    const owned = (
      id: string,
      title: string,
      overrides: Partial<AgentThread>,
    ) =>
      makeThread(id, title, {
        accessLevel: AgentThreadAccessLevel.OWNER,
        attentionState: 'updated',
        brandId: 'brand-a',
        brandLabel: 'Acme Skincare',
        canManageShares: true,
        userId: ME,
        ...overrides,
      });
    renderWithQuery(
      <AgentThreadsPanel
        apiService={apiService}
        getThreadHref={(threadId) => `/acme/~/agent/${threadId}`}
        threads={[
          owned('everyone', 'Org-wide recap', {
            shareCount: 1,
            shareScope: AgentThreadShareScope.ORGANIZATION,
          }),
          owned('brand', 'Brand calendar', {
            shareCount: 2,
            shareScope: AgentThreadShareScope.BRAND,
          }),
          owned('people', 'Pair on hooks', {
            shareCount: 2,
            shareScope: AgentThreadShareScope.MEMBER,
          }),
          owned('solo', 'Private draft', {}),
          viewThread,
        ]}
      />,
    );

    const row = (name: RegExp) => screen.getByRole('link', { name });
    expect(row(/Org-wide recap/)).toHaveTextContent('Shared · Organization');
    expect(row(/Brand calendar/)).toHaveTextContent('Shared · Acme Skincare');
    expect(row(/Pair on hooks/)).toHaveTextContent('Shared · 2 people');
    expect(row(/Private draft/)).not.toHaveTextContent('Shared');
    expect(row(/Weekly performance recap/)).not.toHaveTextContent('Shared');
  });

  it('narrows the list to threads shared with me, or to mine, from the Filters menu', async () => {
    const user = userEvent.setup();
    renderPanel();

    await pickOwner(user, 'Shared with me');
    expect(urlStore.get()).toBe('owner=shared');
    expect(
      await screen.findByRole('link', { name: /Weekly performance recap/ }),
    ).toBeVisible();
    expect(
      screen.getByRole('link', { name: /Bundle video hooks/ }),
    ).toBeVisible();
    expect(screen.queryByRole('link', { name: /Serum launch/ })).toBeNull();

    await pickOwner(user, 'Mine');
    expect(urlStore.get()).toBe('owner=mine');
    expect(
      await screen.findByRole('link', { name: /Serum launch/ }),
    ).toBeVisible();
    expect(
      screen.queryByRole('link', { name: /Weekly performance/ }),
    ).toBeNull();

    await pickOwner(user, 'All');
    expect(urlStore.get()).toBe('');
  });

  it('opens already narrowed when the URL carries the owner filter', () => {
    urlStore.set('owner=shared');
    renderPanel();

    expect(
      screen.getByRole('link', { name: /Weekly performance recap/ }),
    ).toBeVisible();
    expect(screen.queryByRole('link', { name: /Serum launch/ })).toBeNull();
  });

  it('opens a view-only thread with the author named and no prompt bar', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(
      screen.getByRole('link', { name: /Weekly performance recap/ }),
    );

    expect(
      await screen.findByText('Reels with a before/after opener won.'),
    ).toBeVisible();
    expect(screen.getByTestId('agent-message-author')).toHaveTextContent(
      'Ana Costa',
    );
    expect(screen.getByTestId('agent-thread-access-badge')).toHaveTextContent(
      'Ana Costa · Can view',
    );
    expect(screen.queryByLabelText('Message')).toBeNull();
    expect(screen.getByTestId('agent-thread-view-only')).toHaveTextContent(
      'Ask Ana Costa for “Can prompt”',
    );
    expect(screen.queryByTestId('agent-thread-share-button')).toBeNull();
  });

  it('keeps the prompt bar for a thread the viewer may prompt', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole('link', { name: /Bundle video hooks/ }));

    expect(await screen.findByLabelText('Message')).toBeVisible();
    expect(screen.getByTestId('agent-thread-access-badge')).toHaveTextContent(
      'Can prompt',
    );
  });

  it('shares an owned thread with a teammate from the scope button', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(
      screen.getByRole('link', { name: /Serum launch captions/ }),
    );
    const scopeButton = await screen.findByTestId('agent-thread-share-button');
    await waitFor(() => expect(scopeButton).toHaveTextContent('Private'));

    await user.click(scopeButton);
    const dialog = await screen.findByRole('dialog', {
      name: 'Share this thread',
    });
    await user.click(
      within(dialog).getByRole('radio', { name: /Specific people/ }),
    );
    await user.click(
      await within(dialog).findByRole('combobox', {
        name: 'Access for Marco Rossi',
      }),
    );
    await user.click(await screen.findByRole('option', { name: 'Can prompt' }));

    await user.click(within(dialog).getByRole('button', { name: 'Done' }));
    expect(
      await screen.findByTestId('agent-thread-share-button'),
    ).toHaveTextContent('1 person');
    expect(liveShares).toEqual([
      expect.objectContaining({
        level: AgentThreadShareLevel.COLLABORATE,
        scope: AgentThreadShareScope.MEMBER,
        targetUserId: MARCO,
      }),
    ]);
  });
  async function openOwnThread(user: ReturnType<typeof userEvent.setup>) {
    renderPanel();
    await user.click(
      screen.getByRole('link', { name: /Serum launch captions/ }),
    );
    return screen.findByTestId('agent-thread-share-button');
  }

  it('does not claim Private while the share lookup is loading or has failed', async () => {
    const user = userEvent.setup();
    apiService.getThreadShares.mockRejectedValue(new Error('lookup failed'));

    const scopeButton = await openOwnThread(user);

    await waitFor(() =>
      expect(scopeButton).toHaveTextContent('Access unverified'),
    );
    expect(scopeButton).not.toHaveTextContent('Private');
    await user.click(scopeButton);
    const dialog = await screen.findByRole('dialog', {
      name: 'Share this thread',
    });
    expect(
      within(dialog).getByText(/Couldn’t confirm who can open this thread/),
    ).toBeVisible();
    expect(
      within(dialog).getByRole('radio', { name: /Only me/ }),
    ).toHaveAttribute('aria-disabled', 'true');
    expect(
      within(dialog).getByRole('radio', { name: /Only me/ }),
    ).not.toBeChecked();

    apiService.getThreadShares.mockImplementation(async () => liveShares);
    await user.click(within(dialog).getByRole('button', { name: 'Try again' }));
    await waitFor(() =>
      expect(
        within(dialog).getByRole('radio', { name: /Only me/ }),
      ).toBeChecked(),
    );
  });

  it('shows the checking state until the lookup answers', async () => {
    const user = userEvent.setup();
    let answer: (shares: AgentThreadShare[]) => void = () => undefined;
    apiService.getThreadShares.mockImplementation(
      () => new Promise<AgentThreadShare[]>((resolve) => (answer = resolve)),
    );

    const scopeButton = await openOwnThread(user);

    expect(scopeButton).toHaveTextContent('Checking access…');
    answer([]);
    await waitFor(() => expect(scopeButton).toHaveTextContent('Private'));
  });

  it('shows the access that remains when a revoke only partly lands', async () => {
    const user = userEvent.setup();
    liveShares = [
      {
        id: 'share-ana',
        level: AgentThreadShareLevel.VIEW,
        scope: AgentThreadShareScope.MEMBER,
        targetUserId: ANA,
        threadId: 'own',
      },
      {
        id: 'share-marco',
        level: AgentThreadShareLevel.VIEW,
        scope: AgentThreadShareScope.MEMBER,
        targetUserId: MARCO,
        threadId: 'own',
      },
    ];
    apiService.deleteThreadShare
      .mockImplementationOnce(async (_threadId: string, shareId: string) => {
        liveShares = liveShares.filter((share) => share.id !== shareId);
      })
      .mockRejectedValueOnce(new Error('delete failed'));

    const scopeButton = await openOwnThread(user);
    await waitFor(() => expect(scopeButton).toHaveTextContent('2 people'));
    await user.click(scopeButton);
    const dialog = await screen.findByRole('dialog', {
      name: 'Share this thread',
    });
    await user.click(within(dialog).getByRole('radio', { name: /Only me/ }));

    expect(
      await within(dialog).findByText(
        'Sharing was only partly updated. 1 person can still open this thread.',
      ),
    ).toBeVisible();
    expect(
      within(dialog).getByRole('radio', { name: /Specific people/ }),
    ).toBeChecked();
    expect(scopeButton).toHaveTextContent('1 person');
  });

  it('confirms what remains only after every revoke has settled', async () => {
    const user = userEvent.setup();
    liveShares = [
      {
        id: 'share-ana',
        level: AgentThreadShareLevel.VIEW,
        scope: AgentThreadShareScope.MEMBER,
        targetUserId: ANA,
        threadId: 'own',
      },
      {
        id: 'share-marco',
        level: AgentThreadShareLevel.VIEW,
        scope: AgentThreadShareScope.MEMBER,
        targetUserId: MARCO,
        threadId: 'own',
      },
    ];
    let finishMarco: () => void = () => undefined;
    apiService.deleteThreadShare
      .mockRejectedValueOnce(new Error('delete failed'))
      .mockImplementationOnce(
        (_threadId: string, shareId: string) =>
          new Promise<void>((resolve) => {
            finishMarco = () => {
              liveShares = liveShares.filter((share) => share.id !== shareId);
              resolve();
            };
          }),
      );

    const scopeButton = await openOwnThread(user);
    await waitFor(() => expect(scopeButton).toHaveTextContent('2 people'));
    await user.click(scopeButton);
    const dialog = await screen.findByRole('dialog', {
      name: 'Share this thread',
    });
    await user.click(within(dialog).getByRole('radio', { name: /Only me/ }));
    await waitFor(() =>
      expect(
        within(dialog).getByRole('radio', { name: /Only me/ }),
      ).toHaveAttribute('aria-disabled', 'true'),
    );
    finishMarco();

    expect(
      await within(dialog).findByText(
        'Sharing was only partly updated. 1 person can still open this thread.',
      ),
    ).toBeVisible();
  });

  it('keeps the recipient picker open after switching from the whole organization to specific people', async () => {
    const user = userEvent.setup();
    liveShares = [
      {
        id: 'share-org',
        level: AgentThreadShareLevel.VIEW,
        scope: AgentThreadShareScope.ORGANIZATION,
        threadId: 'own',
      },
    ];
    const scopeButton = await openOwnThread(user);
    await user.click(scopeButton);
    const dialog = await screen.findByRole('dialog', {
      name: 'Share this thread',
    });
    await user.click(
      within(dialog).getByRole('radio', { name: /Specific people/ }),
    );

    await waitFor(() =>
      expect(
        within(dialog).getByRole('radio', { name: /Specific people/ }),
      ).toBeChecked(),
    );
    expect(
      await within(dialog).findByRole('combobox', {
        name: 'Access for Marco Rossi',
      }),
    ).toBeVisible();
  });

  it('reads access as unverified when the readback after a change fails', async () => {
    const user = userEvent.setup();
    const scopeButton = await openOwnThread(user);
    await waitFor(() => expect(scopeButton).toHaveTextContent('Private'));
    await user.click(scopeButton);
    const dialog = await screen.findByRole('dialog', {
      name: 'Share this thread',
    });
    await user.click(
      within(dialog).getByRole('radio', { name: /Specific people/ }),
    );
    await user.click(
      await within(dialog).findByRole('combobox', {
        name: 'Access for Marco Rossi',
      }),
    );
    apiService.getThreadShares.mockRejectedValueOnce(new Error('readback'));
    await user.click(await screen.findByRole('option', { name: 'Can view' }));

    expect(
      await within(dialog).findByText(/Couldn’t confirm the change/),
    ).toBeVisible();
    expect(scopeButton).toHaveTextContent('Access unverified');
    expect(
      within(dialog).getByRole('radio', { name: /Only me/ }),
    ).toHaveAttribute('aria-disabled', 'true');
  });

  it('tells a failed roster lookup from an empty one, and recovers on retry', async () => {
    const user = userEvent.setup();
    roster.isFailed = true;
    const scopeButton = await openOwnThread(user);
    await waitFor(() => expect(scopeButton).toHaveTextContent('Private'));
    await user.click(scopeButton);
    const dialog = await screen.findByRole('dialog', {
      name: 'Share this thread',
    });
    await user.click(
      within(dialog).getByRole('radio', { name: /Specific people/ }),
    );

    expect(
      await within(dialog).findByText('Couldn’t load members.'),
    ).toBeVisible();
    expect(
      within(dialog).queryByText('No other active members yet.'),
    ).toBeNull();

    // The retry is held open so the loading state can be seen before it ends.
    let finishRetry: () => void = () => undefined;
    roster.gate = new Promise<void>((resolve) => {
      finishRetry = resolve;
    });
    roster.isFailed = false;
    await user.click(within(dialog).getByRole('button', { name: 'Try again' }));

    expect(await within(dialog).findByRole('status')).toHaveTextContent(
      'Loading members…',
    );
    expect(within(dialog).queryByText('Couldn’t load members.')).toBeNull();

    finishRetry();

    expect(
      await within(dialog).findByRole('combobox', {
        name: 'Access for Marco Rossi',
      }),
    ).toBeEnabled();
    expect(
      within(dialog).getByRole('combobox', { name: 'Access for Ana Costa' }),
    ).toBeEnabled();
    expect(within(dialog).queryByText('Couldn’t load members.')).toBeNull();
    expect(within(dialog).queryByText('Loading members…')).toBeNull();
    expect(
      within(dialog).queryByText('No other active members yet.'),
    ).toBeNull();
  });

  it('says there is no one to share with only after a successful empty lookup', async () => {
    const user = userEvent.setup();
    roster.rows = [members[0]];
    const scopeButton = await openOwnThread(user);
    await waitFor(() => expect(scopeButton).toHaveTextContent('Private'));
    await user.click(scopeButton);
    const dialog = await screen.findByRole('dialog', {
      name: 'Share this thread',
    });
    await user.click(
      within(dialog).getByRole('radio', { name: /Specific people/ }),
    );

    expect(
      await within(dialog).findByText('No other active members yet.'),
    ).toBeVisible();
  });

  it('shows the confirmed scope again after Done discards an unsaved pick', async () => {
    const user = userEvent.setup();
    const scopeButton = await openOwnThread(user);
    await waitFor(() => expect(scopeButton).toHaveTextContent('Private'));
    await user.click(scopeButton);
    let dialog = await screen.findByRole('dialog', {
      name: 'Share this thread',
    });
    await user.click(
      within(dialog).getByRole('radio', { name: /Specific people/ }),
    );
    expect(
      within(dialog).getByRole('radio', { name: /Specific people/ }),
    ).toBeChecked();

    await user.click(within(dialog).getByRole('button', { name: 'Done' }));
    await user.click(scopeButton);
    dialog = await screen.findByRole('dialog', { name: 'Share this thread' });

    expect(
      within(dialog).getByRole('radio', { name: /Only me/ }),
    ).toBeChecked();
  });

  it('offers a recipient an owner or administrator reaches, and holds back one with no access to the brand', async () => {
    const user = userEvent.setup();
    roster.rows = [
      members[0],
      { ...members[1], brandIds: [] },
      { ...members[2], brandIds: [] },
    ];
    const scopeButton = await openOwnThread(user);
    await waitFor(() => expect(scopeButton).toHaveTextContent('Private'));
    await user.click(scopeButton);
    const dialog = await screen.findByRole('dialog', {
      name: 'Share this thread',
    });
    await user.click(
      within(dialog).getByRole('radio', { name: /Specific people/ }),
    );

    expect(
      await within(dialog).findByRole('combobox', {
        name: 'Access for Ana Costa',
      }),
    ).toBeEnabled();
    expect(
      within(dialog).getByRole('combobox', { name: 'Access for Marco Rossi' }),
    ).toBeDisabled();
    expect(
      within(dialog).getByText('Creator · no access to Acme Skincare'),
    ).toBeVisible();
  });

  it('clears the previous thread and holds sharing until the next thread confirms its shares', async () => {
    const user = userEvent.setup();
    apiService.getThreadShares.mockImplementation(async (threadId: string) =>
      threadId === 'own'
        ? [
            {
              id: 'share-org',
              level: AgentThreadShareLevel.VIEW,
              scope: AgentThreadShareScope.ORGANIZATION,
              threadId: 'own',
            },
          ]
        : liveShares,
    );
    const scopeButton = await openOwnThread(user);
    await waitFor(() => expect(scopeButton).toHaveTextContent('Organization'));

    let answer: (shares: AgentThreadShare[]) => void = () => undefined;
    apiService.getThreadShares.mockImplementation(
      () => new Promise<AgentThreadShare[]>((resolve) => (answer = resolve)),
    );
    await user.click(screen.getByRole('button', { name: 'Threads' }));
    await user.click(
      screen.getByRole('link', { name: /Review the queued post/ }),
    );
    const nextButton = await screen.findByTestId('agent-thread-share-button');

    expect(nextButton).toHaveTextContent('Checking access…');
    expect(nextButton).not.toHaveTextContent('Organization');
    answer([]);
    await waitFor(() => expect(nextButton).toHaveTextContent('Private'));
  });

  it('hides the plan decision from a recipient who can only view', async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.click(
      screen.getByRole('link', { name: /Weekly performance recap/ }),
    );

    expect(await screen.findByText('Awaiting review')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Request changes' }),
    ).toBeNull();
  });

  it('keeps the plan decision for a recipient who can prompt', async () => {
    const user = userEvent.setup();
    renderPanel();
    apiService.getMessages.mockImplementation(async () => [
      ...sharedMessages.map((message) => ({ ...message, threadId: 'prompt' })),
    ]);
    await user.click(screen.getByRole('link', { name: /Bundle video hooks/ }));

    expect(
      await screen.findByRole('button', { name: 'Approve' }),
    ).toBeVisible();
  });

  it('hands an owned thread to a teammate from the More menu', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(
      screen.getByRole('link', { name: /Serum launch captions/ }),
    );
    await user.click(await screen.findByTestId('agent-thread-more'));
    await user.click(await screen.findByRole('menuitem', { name: 'Hand Off' }));
    const dialog = await screen.findByRole('dialog', {
      name: 'Hand off to a teammate',
    });
    await user.type(
      within(dialog).getByRole('textbox', { name: 'Request' }),
      'Review the queued post',
    );
    await user.click(
      within(dialog).getByRole('button', { name: 'Send hand-off' }),
    );

    expect(apiService.createAgentHandoff).toHaveBeenCalledWith(
      expect.objectContaining({
        content: 'Review the queued post',
        destinationUserId: ANA,
        sourceThreadId: 'own',
      }),
    );
    expect(
      await screen.findByText(
        'Handed off to Ana Costa. Waiting for them to accept.',
      ),
    ).toBeVisible();
  });

  it('offers no hand-off on a thread the viewer does not own', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(
      screen.getByRole('link', { name: /Weekly performance recap/ }),
    );
    await screen.findByTestId('agent-thread-access-badge');

    expect(screen.queryByTestId('agent-thread-more')).toBeNull();
  });

  it('answers a hand-off sent to the viewer from its card', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(
      screen.getByRole('link', { name: /Review the queued post/ }),
    );
    expect(
      await screen.findByText('Ana Costa handed this to your agent'),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Accept' }));

    expect(apiService.acceptAgentTransfer).toHaveBeenCalledWith('transfer-9');
    expect(
      await screen.findByText('Accepted. Your agent is on it.'),
    ).toBeVisible();
  });
});
