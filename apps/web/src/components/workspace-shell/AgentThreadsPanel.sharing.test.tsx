import type { AgentThread, AgentThreadShare } from '@genfeedai/agent';
import type { AgentChatMessage } from '@genfeedai/agent/models/agent-chat.model';
import {
  AgentThreadAccessLevel,
  AgentThreadShareLevel,
  AgentThreadShareScope,
  AgentThreadStatus,
} from '@genfeedai/contracts';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
    roleLabel: 'Owner',
    userId: ME,
  },
  {
    avatarUrl: null,
    brandIds: ['brand-a'],
    name: 'Ana Costa',
    roleLabel: 'Admin',
    userId: ANA,
  },
  {
    avatarUrl: null,
    brandIds: ['brand-a'],
    name: 'Marco Rossi',
    roleLabel: 'Creator',
    userId: MARCO,
  },
];

vi.mock('@/components/workspace-shell/use-agent-thread-members', () => ({
  useAgentThreadMembers: () => ({
    isLoading: false,
    members,
    membersById: new Map(members.map((member) => [member.userId, member])),
  }),
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
const threads = [ownThread, viewThread, promptThread];

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
];

// A share store the API stand-in reads and writes, so the dialog shows what a
// real server would hold after each change.
let liveShares: AgentThreadShare[] = [];
const apiService = {
  chatStream: vi.fn(),
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
  getMessages: vi.fn(async () => sharedMessages),
  getThreadShares: vi.fn(async () => liveShares),
  respondToUiAction: vi.fn(),
};

function renderPanel() {
  return render(
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
    urlStore.set('');
  });

  it('names the owner of a thread shared with the viewer in its row', () => {
    renderPanel();

    expect(
      screen.getByRole('link', { name: /Weekly performance recap/ }),
    ).toHaveTextContent('Ana Costa');
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
    render(
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
    expect(scopeButton).toHaveTextContent('Private');

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
});
