import { assertSourceHasExport } from '@shared/pages/sourceContractTestUtils';
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ChangeEvent, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SocialMessagesPage from './page';

assertSourceHasExport(
  'app/(protected)/[orgSlug]/[brandSlug]/messages/page.tsx',
);

const mocks = vi.hoisted(() => ({
  getService: vi.fn(),
  href: vi.fn((path: string) => `/acme/demo${path}`),
  list: vi.fn(),
  listMessages: vi.fn(),
  postReply: vi.fn(),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => mocks.getService,
}));

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({
    href: mocks.href,
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
    asChild,
    children,
    disabled,
    isDisabled,
    onClick,
    title,
  }: {
    asChild?: boolean;
    children?: ReactNode;
    disabled?: boolean;
    isDisabled?: boolean;
    onClick?: () => void;
    title?: string;
  }) =>
    asChild ? (
      (children ?? null)
    ) : (
      <button
        disabled={disabled || isDisabled}
        title={title}
        type="button"
        onClick={onClick}
      >
        {children}
      </button>
    ),
}));

vi.mock('@ui/primitives/input', () => ({
  Input: ({
    onChange,
    placeholder,
    value,
  }: {
    onChange: (event: ChangeEvent<HTMLInputElement>) => void;
    placeholder?: string;
    value: string;
  }) => <input placeholder={placeholder} value={value} onChange={onChange} />,
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
      actorType: 'agent',
      agentRunId: 'agent-run-1',
      platform: 'youtube',
      status: 'draft',
      userId: 'user-1',
      workflowRunId: 'workflow-run-1',
    },
    agentRunId: 'agent-run-1',
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
    mocks.getService.mockResolvedValue({
      approveDraft: vi.fn(),
      createDraft: vi.fn(),
      list: mocks.list,
      listMessages: mocks.listMessages,
      postReply: mocks.postReply,
      rejectDraft: vi.fn(),
      sendDm: vi.fn(),
      syncYoutube: vi.fn(),
      updateStatus: vi.fn(),
    });
    mocks.list.mockResolvedValue([conversation]);
    mocks.listMessages.mockResolvedValue(messages);
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
      await screen.findByRole('heading', { name: 'Messages' }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(mocks.list).toHaveBeenCalledWith({ limit: 50, status: 'open' }),
    );

    expect(screen.getAllByText('Taylor')).not.toHaveLength(0);
    expect(screen.getAllByText('Need pricing help')).not.toHaveLength(0);
    expect(
      await screen.findByText('Here is a drafted answer.'),
    ).toBeInTheDocument();
    expect(screen.getByText('workflow-run-1')).toBeInTheDocument();
    expect(screen.getByText('agent-run-1')).toBeInTheDocument();
    expect(screen.getByText('user-1')).toBeInTheDocument();
    expect(screen.getByText('Draft')).toBeInTheDocument();

    const automationLink = screen.getByRole('link', { name: /Automation/i });
    expect(automationLink).toHaveAttribute(
      'href',
      expect.stringContaining('/workflows/new?'),
    );
    expect(automationLink).toHaveAttribute(
      'href',
      expect.stringContaining('conversationId=conversation-1'),
    );
    expect(automationLink).toHaveAttribute(
      'href',
      expect.stringContaining('trigger=commentTrigger'),
    );

    fireEvent.change(screen.getByPlaceholderText('Write a reply or DM'), {
      target: { value: 'Thanks for the detail.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^Reply$/ }));

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
    expect(await screen.findByText('Reply posted.')).toBeInTheDocument();
  });
});
