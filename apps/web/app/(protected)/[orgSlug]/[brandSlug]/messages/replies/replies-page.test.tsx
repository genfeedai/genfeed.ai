import {
  createTestQueryClient,
  queryClientWrapper,
} from '@app-tests/query-client.harness';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import RepliesPage from './replies-page';

const mocks = vi.hoisted(() => ({
  getAuthorReplyInbox: vi.fn(),
  sendAuthorReply: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', async () => ({
  useAuthIdentity: (await import('@app-tests/query-client.harness'))
    .useTestViewer,
}));

const replyBotService = {
  getAuthorReplyInbox: mocks.getAuthorReplyInbox,
  sendAuthorReply: mocks.sendAuthorReply,
};

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => replyBotService,
}));

vi.mock('@hooks/navigation/use-collection-scope/use-collection-scope', () => ({
  useCollectionScope: () => ({ brandId: 'brand-1', pageScope: 'brand' }),
}));

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ orgSlug: 'org' }),
}));

vi.mock('@/hooks/pages/use-brand-detail/use-brand-detail', () => ({
  useBrandDetail: () => ({ brand: { id: 'brand-1' }, isLoading: false }),
}));

vi.mock(
  '@/hooks/auth/use-platform-oauth-connect/use-platform-oauth-connect',
  () => ({ usePlatformOAuthConnect: () => vi.fn() }),
);

vi.mock('@/components/content/admin-filters/useAdminSearchParam', () => ({
  useAdminSearchParam: () => ({ search: '', setSearch: vi.fn() }),
}));

vi.mock('@/components/content/search-field/SearchField', () => ({
  default: () => null,
}));

vi.mock('@ui/layout/subbar-controls/SubbarControls', () => ({
  default: () => null,
}));

vi.mock('@ui/layout/container/Container', () => ({
  default: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));

vi.mock('./replies-warmup-queue', () => ({ default: () => null }));
vi.mock('./replies-warmup-targets', () => ({ default: () => null }));

vi.mock('./replies-reply-composer', () => ({
  default: ({
    authorUsername,
    onSend,
  }: {
    authorUsername: string;
    onSend: () => void;
  }) => (
    <button onClick={onSend} type="button">
      Send to {authorUsername}
    </button>
  ),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

vi.mock('sonner', () => ({
  toast: { error: mocks.toastError, message: vi.fn(), success: vi.fn() },
}));

vi.mock('@genfeedai/services/core/logger.service', () => ({
  logger: { error: vi.fn(), info: vi.fn() },
}));

const INBOX = {
  hours: 24,
  items: [
    {
      authorId: 'author-1',
      authorUsername: 'ada',
      commentId: 'comment-1',
      commentText: 'Love this launch',
      createdAt: '2026-11-02T10:00:00.000Z',
      intent: 'thanks',
      intentLabel: 'Thanks',
      parentPostId: 'post-1',
      shouldSkipAuto: false,
    },
  ],
  platform: 'twitter',
  username: 'genfeed',
};

describe('RepliesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAuthorReplyInbox.mockResolvedValue(INBOX);
    mocks.sendAuthorReply.mockResolvedValue({ success: true });
  });

  it('shows reply skeletons, not the clear inbox, while the first read is in flight', () => {
    mocks.getAuthorReplyInbox.mockReturnValue(new Promise(() => {}));

    render(<RepliesPage />, { wrapper: queryClientWrapper() });

    expect(
      screen.getAllByRole('status', { name: 'Loading reply' }),
    ).toHaveLength(3);
    expect(screen.queryByText('Inbox clear')).not.toBeInTheDocument();
  });

  it('paints the cached inbox at once when coming back, without a new read', async () => {
    const client = createTestQueryClient();
    const firstVisit = render(<RepliesPage />, {
      wrapper: queryClientWrapper(client),
    });
    expect(await screen.findByText('Love this launch')).toBeInTheDocument();
    firstVisit.unmount();

    mocks.getAuthorReplyInbox.mockReturnValue(new Promise(() => {}));
    render(<RepliesPage />, { wrapper: queryClientWrapper(client) });

    expect(screen.getByText('Love this launch')).toBeInTheDocument();
    expect(screen.getByText('@genfeed')).toBeInTheDocument();
    expect(
      screen.queryByRole('status', { name: 'Loading reply' }),
    ).not.toBeInTheDocument();
  });

  it('drops a reply from the inbox once it is sent', async () => {
    render(<RepliesPage />, { wrapper: queryClientWrapper() });

    fireEvent.click(await screen.findByRole('button', { name: 'Send to ada' }));

    await waitFor(() =>
      expect(screen.queryByText('Love this launch')).not.toBeInTheDocument(),
    );
    expect(screen.getByText('Inbox clear')).toBeInTheDocument();
  });

  it('shows the read failure once instead of an empty inbox', async () => {
    mocks.getAuthorReplyInbox.mockRejectedValue(new Error('X is unavailable'));

    render(<RepliesPage />, { wrapper: queryClientWrapper() });

    expect(await screen.findByText('Inbox unavailable')).toBeInTheDocument();
    expect(mocks.toastError).toHaveBeenCalledTimes(1);
  });
});
