import { assertSourceHasExport } from '@shared/pages/sourceContractTestUtils';
import '@testing-library/jest-dom/vitest';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import type { ChangeEvent, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SocialMessagesPage from './page';

assertSourceHasExport(
  'app/(protected)/[orgSlug]/[brandSlug]/messages/page.tsx',
);

const mocks = vi.hoisted(() => ({
  brandContext: {
    brands: [
      {
        credentials: [
          {
            id: 'credential-1',
            isConnected: true,
            platform: 'YOUTUBE',
          },
        ],
        id: 'brand-1',
        label: 'Demo Brand',
        slug: 'demo',
      },
    ],
    credentialsLoading: false,
    isBrandScopeResolved: true,
    organizationId: 'org-1',
    selectedBrand: { id: 'brand-1', label: 'Demo Brand', slug: 'demo' },
  },
  getService: vi.fn(),
  href: vi.fn((path: string) => `/acme/demo${path}`),
  listMessagesPage: vi.fn(),
  listPage: vi.fn(),
  postReply: vi.fn(),
  replace: vi.fn(),
  seedComposer: vi.fn(),
  setAgentOpen: vi.fn(),
  syncInstagram: vi.fn(),
  syncInstagramDms: vi.fn(),
  syncLinkedIn: vi.fn(),
  syncLinkedInDms: vi.fn(),
  syncX: vi.fn(),
  syncXDms: vi.fn(),
  syncYoutube: vi.fn(),
  workspaceNavPanel: null as {
    portalTarget: HTMLElement | null;
    setPortalTarget: ReturnType<typeof vi.fn>;
  } | null,
}));

vi.mock('@genfeedai/agent', () => ({
  useAgentChatStore: (selector: (state: unknown) => unknown) =>
    selector({
      activeThreadId: 'agent-thread-1',
      seedComposer: mocks.seedComposer,
      setIsOpen: mocks.setAgentOpen,
      threads: [{ brandId: 'brand-1', id: 'agent-thread-1' }],
    }),
}));

vi.mock('@genfeedai/agent/components/AgentOAuthConnectMenu', () => ({
  AgentOAuthConnectMenu: ({
    triggerLabel = 'Connect accounts',
  }: {
    triggerLabel?: string;
  }) => (
    <button type="button" aria-label="Connect a social channel">
      {triggerLabel}
    </button>
  ),
}));

vi.mock(
  '@hooks/auth/use-platform-oauth-connect/use-platform-oauth-connect',
  () => ({
    usePlatformOAuthConnect: () => vi.fn(),
  }),
);

vi.mock('@genfeedai/contexts/user/brand-context/brand-context', () => ({
  useBrand: () => mocks.brandContext,
}));

vi.mock('@/components/workspace-shell/WorkspaceNavPanelContext', () => ({
  useWorkspaceNavPanel: () => mocks.workspaceNavPanel,
}));

vi.mock('@genfeedai/contexts/user/brand-context/brand-context.helpers', () => ({
  getBrandEntityId: (brand: { id?: string } | null | undefined) =>
    brand?.id ?? '',
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => mocks.getService,
}));

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({
    brandSlug: 'demo',
    href: mocks.href,
    orgSlug: 'acme',
  }),
}));

vi.mock('@ui/layout/container/Container', () => ({
  default: ({ children }: { children: ReactNode }) => (
    <section>{children}</section>
  ),
}));

vi.mock('@ui/loading/fallback/LazyLoadingFallback', () => ({
  default: () => <div>Loading messages</div>,
}));

vi.mock('@ui/primitives/button', () => ({
  Button: ({
    'aria-pressed': ariaPressed,
    ariaLabel,
    asChild,
    children,
    disabled,
    icon,
    isDisabled,
    onClick,
    title,
  }: {
    'aria-pressed'?: boolean;
    ariaLabel?: string;
    asChild?: boolean;
    children?: ReactNode;
    disabled?: boolean;
    icon?: ReactNode;
    isDisabled?: boolean;
    onClick?: () => void;
    title?: string;
  }) =>
    asChild ? (
      (children ?? null)
    ) : (
      <button
        aria-label={ariaLabel}
        aria-pressed={ariaPressed}
        disabled={disabled || isDisabled}
        title={title}
        type="button"
        onClick={onClick}
      >
        {icon}
        {children}
      </button>
    ),
}));

vi.mock('@ui/primitives/input', () => ({
  Input: ({
    'aria-label': ariaLabel,
    onChange,
    placeholder,
    value,
  }: {
    'aria-label'?: string;
    onChange: (event: ChangeEvent<HTMLInputElement>) => void;
    placeholder?: string;
    value: string;
  }) => (
    <input
      aria-label={ariaLabel}
      placeholder={placeholder}
      value={value}
      onChange={onChange}
    />
  ),
}));

vi.mock('@ui/primitives/select', () => ({
  Select: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  SelectItem: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children }: { children: ReactNode }) => (
    <button type="button">{children}</button>
  ),
  SelectValue: ({ placeholder }: { placeholder?: string }) => (
    <span>{placeholder}</span>
  ),
}));

vi.mock('@ui/primitives/textarea', () => ({
  Textarea: ({
    onChange,
    placeholder,
    value,
  }: {
    onChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
    placeholder?: string;
    value: string;
  }) => (
    <textarea placeholder={placeholder} value={value} onChange={onChange} />
  ),
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/acme/demo/messages',
  useRouter: () => ({ replace: mocks.replace }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('./messages-surface-adapter', () => ({
  useMessagesSurfaceAdapter: vi.fn(),
}));

vi.mock('./use-messages-realtime', () => ({
  useMessagesRealtime: () => 'connected',
}));

const conversation = {
  automationState: 'manual',
  availability: {
    canPostReply: true,
    canSendDm: false,
    sendDmReason: 'YouTube Data API does not support channel DMs',
  },
  brandId: 'brand-1',
  conversationType: 'comment',
  createdAt: '2026-07-02T08:00:00.000Z',
  credentialId: 'credential-1',
  externalConversationId: 'thread-1',
  id: 'conversation-1',
  latestMessageAt: '2026-07-02T08:00:00.000Z',
  latestMessageText: 'Need pricing help',
  needsReview: true,
  organizationId: 'org-1',
  participantHandle: '@taylor',
  participantName: 'Taylor',
  platform: 'youtube',
  priority: 'normal',
  sourceContentId: 'video-1',
  sourceContentTitle: 'Launch video',
  status: 'open',
  tags: [],
  unreadCount: 1,
  updatedAt: '2026-07-02T08:00:00.000Z',
};

const messages = [
  {
    body: 'Need pricing help',
    conversationId: 'conversation-1',
    createdAt: '2026-07-02T08:00:00.000Z',
    direction: 'inbound',
    id: 'message-1',
    messageType: 'comment',
    platform: 'youtube',
    senderName: 'Taylor',
    status: 'received',
    updatedAt: '2026-07-02T08:00:00.000Z',
  },
  {
    actionProvenance: {
      action: 'draft',
      actedAt: '2026-07-02T08:05:30.000Z',
      actorType: 'workflow',
      platform: 'youtube',
      status: 'draft',
      userId: 'user-1',
      workflowRunId: 'workflow-run-1',
    },
    body: 'Here is a drafted answer.',
    conversationId: 'conversation-1',
    createdAt: '2026-07-02T08:05:00.000Z',
    direction: 'outbound',
    id: 'message-2',
    messageType: 'reply',
    platform: 'youtube',
    status: 'draft',
    updatedAt: '2026-07-02T08:05:00.000Z',
    userId: 'user-1',
    workflowRunId: 'workflow-run-1',
  },
];

describe('SocialMessagesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.brandContext.brands = [
      {
        credentials: [
          {
            id: 'credential-1',
            isConnected: true,
            platform: 'YOUTUBE',
          },
        ],
        id: 'brand-1',
        label: 'Demo Brand',
        slug: 'demo',
      },
    ];
    mocks.brandContext.credentialsLoading = false;
    mocks.brandContext.isBrandScopeResolved = true;
    mocks.workspaceNavPanel = null;
    mocks.getService.mockResolvedValue({
      approveDraft: vi.fn(),
      createDraft: vi.fn(),
      getConversation: vi.fn(),
      listMessagesPage: mocks.listMessagesPage,
      listPage: mocks.listPage,
      postReply: mocks.postReply,
      rejectDraft: vi.fn(),
      sendDm: vi.fn(),
      syncInstagram: mocks.syncInstagram,
      syncInstagramDms: mocks.syncInstagramDms,
      syncLinkedIn: mocks.syncLinkedIn,
      syncLinkedInDms: mocks.syncLinkedInDms,
      syncX: mocks.syncX,
      syncXDms: mocks.syncXDms,
      syncYoutube: mocks.syncYoutube,
      updateStatus: vi.fn(),
    });
    mocks.listPage.mockResolvedValue({
      hasNext: false,
      hasPrevious: false,
      items: [conversation],
      page: 1,
      pageSize: 50,
      total: 1,
      totalPages: 1,
    });
    mocks.listMessagesPage.mockResolvedValue({
      hasNext: false,
      hasPrevious: false,
      items: messages,
      page: 1,
      pageSize: 50,
      total: messages.length,
      totalPages: 1,
    });
    mocks.postReply.mockResolvedValue({
      ...messages[1],
      body: 'Thanks for the detail.',
      id: 'message-3',
      status: 'sent',
    });
  });

  it('renders the inbox route, workflow automation link, and reply action', async () => {
    render(<SocialMessagesPage />);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Messages' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Sync inbox' }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(mocks.listPage).toHaveBeenCalledWith(
        {
          brandId: 'brand-1',
          limit: 50,
          page: 1,
          status: 'open',
        },
        expect.any(AbortSignal),
      ),
    );

    expect(screen.getAllByText('Taylor')).not.toHaveLength(0);
    expect(screen.getAllByText('Need pricing help')).not.toHaveLength(0);
    expect(
      await screen.findByText('Here is a drafted answer.'),
    ).toBeInTheDocument();
    expect(screen.getByText('workflow-run-1')).toBeInTheDocument();
    expect(screen.getByText('user-1')).toBeInTheDocument();
    expect(screen.getByText('Draft')).toBeInTheDocument();
    expect(screen.getByText('Comment · youtube')).toBeInTheDocument();
    expect(screen.getByText('Reply composer')).toBeInTheDocument();
    const conversationButton = screen.getByRole('button', {
      name: 'Open social conversation with Taylor',
    });
    expect(conversationButton).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(conversationButton);
    expect(mocks.replace).toHaveBeenCalledWith(
      '/acme/demo/messages?socialConversation=conversation-1',
      { scroll: false },
    );

    const automationLink = screen.getByRole('link', { name: /Automation/i });
    expect(automationLink).toHaveAttribute(
      'href',
      expect.stringContaining('/automation/workflows/new?'),
    );
    expect(automationLink).toHaveAttribute(
      'href',
      expect.stringContaining('conversationId=conversation-1'),
    );
    expect(automationLink).toHaveAttribute(
      'href',
      expect.stringContaining('trigger=commentTrigger'),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Draft with Agent' }));
    expect(mocks.seedComposer).toHaveBeenCalledWith(
      expect.stringContaining('Draft a concise public reply'),
      'agent-thread-1',
    );
    expect(mocks.setAgentOpen).toHaveBeenCalledWith(true);

    fireEvent.change(screen.getByPlaceholderText('Write a reply or DM'), {
      target: { value: 'Thanks for the detail.' },
    });
    const replyButton = screen.getByRole('button', { name: /^Reply$/ });
    fireEvent.click(replyButton);
    fireEvent.click(replyButton);

    await waitFor(() =>
      expect(mocks.postReply).toHaveBeenCalledWith(
        'conversation-1',
        expect.objectContaining({
          idempotencyKey: expect.stringMatching(
            /^messages:conversation-1:reply:/,
          ),
          text: 'Thanks for the detail.',
        }),
      ),
    );
    expect(mocks.postReply).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Reply posted.')).toBeInTheDocument();
  });

  it('shows sync as the primary empty action when an account is connected', async () => {
    mocks.listPage.mockResolvedValue({
      hasNext: false,
      hasPrevious: false,
      items: [],
      page: 1,
      pageSize: 50,
      total: 0,
      totalPages: 1,
    });

    render(<SocialMessagesPage />);

    const sidebarEmpty = await screen.findByTestId('messages-sidebar-empty');
    expect(
      within(sidebarEmpty).getByText('No conversations yet'),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId('messages-empty-state')).getByText(
        'Select a conversation',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole('button', { name: /Connect a social channel/i })
        .length,
    ).toBeGreaterThan(0);
    expect(
      screen.getByRole('navigation', { name: 'Social conversations' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('textbox', {
        name: 'Search social conversations',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Sync inbox' }),
    ).toBeInTheDocument();

    expect(screen.getByTestId('messages-surface-layout')).toHaveClass(
      'min-h-0',
      'flex-1',
      'overflow-hidden',
    );
    expect(screen.getByTestId('messages-empty-state')).toHaveClass(
      'min-h-0',
      'flex-1',
    );
  });

  it('makes account connection the first empty state when no social account is connected', async () => {
    mocks.brandContext.brands = [
      {
        credentials: [],
        id: 'brand-1',
        label: 'Demo Brand',
        slug: 'demo',
      },
    ];
    mocks.listPage.mockResolvedValue({
      hasNext: false,
      hasPrevious: false,
      items: [],
      page: 1,
      pageSize: 50,
      total: 0,
      totalPages: 1,
    });

    render(<SocialMessagesPage />);

    const sidebarEmpty = await screen.findByTestId('messages-sidebar-empty');
    expect(
      within(sidebarEmpty).getByText('Connect your social accounts'),
    ).toBeInTheDocument();
    expect(
      within(sidebarEmpty).getByRole('button', {
        name: 'Connect a social channel',
      }),
    ).toBeInTheDocument();
    expect(
      within(sidebarEmpty).queryByRole('button', { name: 'Sync inbox' }),
    ).not.toBeInTheDocument();
    expect(
      within(screen.getByTestId('messages-empty-state')).getByText(
        'Connect accounts to start your inbox',
      ),
    ).toBeInTheDocument();
  });

  it('projects the conversation list into the Messages navigation column', async () => {
    const portalTarget = document.createElement('div');
    document.body.append(portalTarget);
    mocks.workspaceNavPanel = {
      portalTarget,
      setPortalTarget: vi.fn(),
    };

    render(<SocialMessagesPage />);

    expect(
      await within(portalTarget).findByRole('navigation', {
        name: 'Social conversations',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole('navigation', { name: 'Social conversations' }),
    ).toHaveLength(1);
    expect(screen.getByTestId('messages-surface-layout')).not.toHaveClass(
      'lg:grid-cols-[380px_minmax(0,1fr)]',
    );

    portalTarget.remove();
  });

  it('switches to the DM surface, queries DMs, and syncs direct messages', async () => {
    mocks.listPage.mockImplementation(
      (params: { conversationType?: string }) => {
        const isDmQuery = params.conversationType === 'dm';

        return Promise.resolve({
          hasNext: false,
          hasPrevious: false,
          items: isDmQuery ? [] : [conversation],
          page: 1,
          pageSize: 50,
          total: isDmQuery ? 0 : 1,
          totalPages: 1,
        });
      },
    );

    render(<SocialMessagesPage />);

    await screen.findByRole('button', { name: 'Sync inbox' });

    fireEvent.click(screen.getByRole('button', { name: 'DMs' }));

    await waitFor(() =>
      expect(mocks.listPage).toHaveBeenCalledWith(
        {
          brandId: 'brand-1',
          conversationType: 'dm',
          limit: 50,
          page: 1,
          status: 'open',
        },
        expect.any(AbortSignal),
      ),
    );

    // DMs are polled, so an unsynced DM surface says so instead of reading as an error.
    const sidebarEmpty = await screen.findByTestId('messages-sidebar-empty');
    expect(
      within(sidebarEmpty).getByText('No direct messages yet'),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: 'Sync direct messages' }),
    );

    await waitFor(() =>
      expect(mocks.syncInstagramDms).toHaveBeenCalledTimes(1),
    );
    expect(mocks.syncXDms).toHaveBeenCalledTimes(1);
    expect(mocks.syncLinkedInDms).toHaveBeenCalledTimes(1);
    expect(mocks.syncYoutube).not.toHaveBeenCalled();
    expect(mocks.syncInstagram).not.toHaveBeenCalled();
    expect(mocks.syncX).not.toHaveBeenCalled();
  });

  it('sweeps every comment platform when syncing the comments surface', async () => {
    render(<SocialMessagesPage />);

    await screen.findByRole('button', { name: 'Sync inbox' });
    fireEvent.click(screen.getByRole('button', { name: 'Comments' }));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Sync comments' }),
    );

    await waitFor(() => expect(mocks.syncYoutube).toHaveBeenCalledTimes(1));
    expect(mocks.syncInstagram).toHaveBeenCalledTimes(1);
    expect(mocks.syncX).toHaveBeenCalledTimes(1);
    expect(mocks.syncLinkedIn).toHaveBeenCalledTimes(1);
    expect(mocks.syncInstagramDms).not.toHaveBeenCalled();
    expect(mocks.syncXDms).not.toHaveBeenCalled();
  });

  it('syncs the unified mailbox and keeps remaining platform enqueues after a partial failure', async () => {
    mocks.syncX.mockRejectedValue(new Error('X is not connected'));

    render(<SocialMessagesPage />);

    const syncButton = await screen.findByRole('button', {
      name: 'Sync inbox',
    });
    const callsAfterLoad = mocks.listPage.mock.calls.length;

    fireEvent.click(syncButton);

    await waitFor(() => expect(mocks.syncYoutube).toHaveBeenCalledTimes(1));
    expect(mocks.syncInstagram).toHaveBeenCalledTimes(1);
    expect(mocks.syncX).toHaveBeenCalledTimes(1);
    expect(mocks.syncLinkedIn).toHaveBeenCalledTimes(1);
    expect(mocks.syncInstagramDms).toHaveBeenCalledTimes(1);
    expect(mocks.syncXDms).toHaveBeenCalledTimes(1);
    expect(mocks.syncLinkedInDms).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(mocks.listPage.mock.calls.length).toBeGreaterThan(callsAfterLoad),
    );
    await waitFor(() =>
      expect(
        screen.getByText(/Partial failure: X failed to queue/),
      ).toBeInTheDocument(),
    );
  });

  it('renders a DM thread without a source content anchor', async () => {
    mocks.listPage.mockResolvedValue({
      hasNext: false,
      hasPrevious: false,
      items: [
        {
          ...conversation,
          availability: {
            canPostReply: false,
            canSendDm: true,
            postReplyReason:
              'Direct message threads have no post or comment to reply on',
          },
          conversationType: 'dm',
          platform: 'instagram',
        },
      ],
      page: 1,
      pageSize: 50,
      total: 1,
      totalPages: 1,
    });

    render(<SocialMessagesPage />);

    expect(
      await screen.findByRole('button', {
        name: 'Open social conversation with Taylor',
      }),
    ).toBeInTheDocument();
    // A DM hangs off no post, so the comment thread's source anchor stays away.
    expect(screen.queryByText('Launch video')).not.toBeInTheDocument();
  });

  it('renders TikTok conversations as read-only without a composer', async () => {
    mocks.listPage.mockResolvedValue({
      hasNext: false,
      hasPrevious: false,
      items: [
        {
          ...conversation,
          availability: {
            canPostReply: false,
            canSendDm: false,
            postReplyReason: 'TikTok conversations are read-only in Genfeed',
            sendDmReason: 'TikTok conversations are read-only in Genfeed',
          },
          platform: 'tiktok',
        },
      ],
      page: 1,
      pageSize: 50,
      total: 1,
      totalPages: 1,
    });

    render(<SocialMessagesPage />);

    expect(
      await screen.findByRole('button', {
        name: 'Open social conversation with Taylor',
      }),
    ).toBeInTheDocument();
    expect(screen.getAllByText('Read only').length).toBeGreaterThan(0);
    expect(
      screen.getByText('TikTok conversations are read-only in Genfeed'),
    ).toBeInTheDocument();
    expect(
      screen.queryByPlaceholderText('Write a reply or DM'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /^Reply$/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /^DM$/ }),
    ).not.toBeInTheDocument();
  });
});
