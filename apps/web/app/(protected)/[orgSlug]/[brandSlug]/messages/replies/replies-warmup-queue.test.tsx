import '@testing-library/jest-dom/vitest';
import {
  createTestQueryClient,
  queryClientWrapper,
} from '@app-tests/query-client.harness';
import {
  fireEvent,
  render as rtlRender,
  screen,
  waitFor,
} from '@testing-library/react';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import RepliesWarmupQueue from './replies-warmup-queue';

const service = {
  confirmReplyQueueItemPosted: vi.fn(),
  dismissReplyQueueItem: vi.fn(),
  findAwaitingApproval: vi.fn(),
  getReplyQueueUsage: vi.fn(),
  openReplyQueueItem: vi.fn(),
};

// next-intl and useAuthedService return stable functions; the component
// reloads when either changes, so the mocks must be stable too.
const translate = (key: string, values?: Record<string, unknown>) =>
  values ? `${key} ${JSON.stringify(values)}` : key;
vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => translate,
}));
const getService = () => Promise.resolve(service);
vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => getService,
}));
vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', async () => ({
  useAuthIdentity: (await import('@app-tests/query-client.harness'))
    .useTestViewer,
}));
vi.mock('sonner', () => ({
  toast: { error: vi.fn(), message: vi.fn(), success: vi.fn() },
}));

function render(ui: ReactElement, client = createTestQueryClient()) {
  return rtlRender(ui, { wrapper: queryClientWrapper(client) });
}

const USAGE = {
  awaiting: 1,
  dailyCap: 8,
  minGapMinutes: 10,
  nextAllowedAt: null,
  postedToday: 2,
  remainingToday: 6,
};
const DRAFT = {
  draftReplyText: 'Sharp take.',
  id: 'activity-1',
  triggerTweetAuthorUsername: 'target',
  triggerTweetText: 'Shipping weekly beats shipping big.',
};

const openedTab = {
  close: vi.fn(),
  location: { href: '' },
  opener: null as unknown,
};

describe('RepliesWarmupQueue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    openedTab.location.href = '';
    service.findAwaitingApproval.mockResolvedValue({ data: [DRAFT], total: 1 });
    service.getReplyQueueUsage.mockResolvedValue(USAGE);
    vi.spyOn(window, 'open').mockReturnValue(openedTab as unknown as Window);
  });

  it('shows the drafted reply under the post it answers', async () => {
    render(<RepliesWarmupQueue />);

    expect(await screen.findByDisplayValue('Sharp take.')).toBeInTheDocument();
    expect(screen.getByText('@target')).toBeInTheDocument();
  });

  it('opens the edited draft in X and only counts it once confirmed', async () => {
    service.openReplyQueueItem.mockResolvedValue({
      intentUrl: 'https://x.com/intent/post?in_reply_to=1&text=Better',
      targetUrl: 'https://x.com/target/status/1',
    });
    service.confirmReplyQueueItemPosted.mockResolvedValue({
      ...USAGE,
      postedToday: 3,
    });
    render(<RepliesWarmupQueue />);

    fireEvent.change(await screen.findByDisplayValue('Sharp take.'), {
      target: { value: 'Better' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'openInX' }));

    await waitFor(() =>
      expect(service.openReplyQueueItem).toHaveBeenCalledWith(
        'activity-1',
        'Better',
      ),
    );
    await waitFor(() =>
      expect(openedTab.location.href).toBe(
        'https://x.com/intent/post?in_reply_to=1&text=Better',
      ),
    );
    expect(service.confirmReplyQueueItemPosted).not.toHaveBeenCalled();

    fireEvent.click(await screen.findByRole('button', { name: 'markPosted' }));

    await waitFor(() =>
      expect(service.confirmReplyQueueItemPosted).toHaveBeenCalledWith(
        'activity-1',
      ),
    );
    await waitFor(() =>
      expect(screen.queryByDisplayValue('Better')).not.toBeInTheDocument(),
    );
  });

  it('opens the tab inside the click, before the reply request resolves', async () => {
    let resolveOpen: (value: { intentUrl: string }) => void = () => undefined;
    service.openReplyQueueItem.mockReturnValue(
      new Promise((resolve) => {
        resolveOpen = resolve;
      }),
    );
    render(<RepliesWarmupQueue />);
    await screen.findByDisplayValue('Sharp take.');

    fireEvent.click(screen.getByRole('button', { name: 'openInX' }));

    expect(window.open).toHaveBeenCalledTimes(1);
    expect(openedTab.location.href).toBe('');

    resolveOpen({ intentUrl: 'https://x.com/intent/post?text=Sharp' });
    await waitFor(() =>
      expect(openedTab.location.href).toBe(
        'https://x.com/intent/post?text=Sharp',
      ),
    );
  });

  it('closes the opened tab when the reply request fails', async () => {
    service.openReplyQueueItem.mockRejectedValue(new Error('nope'));
    render(<RepliesWarmupQueue />);

    fireEvent.click(await screen.findByRole('button', { name: 'openInX' }));

    await waitFor(() => expect(openedTab.close).toHaveBeenCalledTimes(1));
    expect(
      screen.queryByRole('button', { name: 'markPosted' }),
    ).not.toBeInTheDocument();
  });

  it('keeps the first row busy while a second row finishes its action', async () => {
    const SECOND = { ...DRAFT, id: 'activity-2', draftReplyText: 'Other.' };
    service.findAwaitingApproval.mockResolvedValue({
      data: [DRAFT, SECOND],
      total: 2,
    });
    let resolveFirst: (value: typeof USAGE) => void = () => undefined;
    service.dismissReplyQueueItem.mockImplementation((id: string) =>
      id === 'activity-1'
        ? new Promise((resolve) => {
            resolveFirst = resolve;
          })
        : Promise.resolve(USAGE),
    );
    render(<RepliesWarmupQueue />);

    const dismissButtons = await screen.findAllByRole('button', {
      name: 'dismiss',
    });
    fireEvent.click(dismissButtons[0]);
    fireEvent.click(dismissButtons[1]);

    await waitFor(() =>
      expect(screen.queryByDisplayValue('Other.')).not.toBeInTheDocument(),
    );
    expect(screen.getByRole('button', { name: 'dismiss' })).toBeDisabled();

    resolveFirst(USAGE);
    await waitFor(() =>
      expect(screen.queryByDisplayValue('Sharp take.')).not.toBeInTheDocument(),
    );
  });

  it('stops offering replies once the daily cap is used', async () => {
    service.getReplyQueueUsage.mockResolvedValue({
      ...USAGE,
      postedToday: 8,
      remainingToday: 0,
    });
    render(<RepliesWarmupQueue />);

    await screen.findByDisplayValue('Sharp take.');

    expect(screen.getByRole('button', { name: 'openInX' })).toBeDisabled();
  });

  it('dismisses a draft without opening X', async () => {
    service.dismissReplyQueueItem.mockResolvedValue(USAGE);
    render(<RepliesWarmupQueue />);

    fireEvent.click(await screen.findByRole('button', { name: 'dismiss' }));

    await waitFor(() =>
      expect(service.dismissReplyQueueItem).toHaveBeenCalledWith('activity-1'),
    );
    expect(window.open).not.toHaveBeenCalled();
  });

  it('paints the queue it already loaded straight away when Replies is reopened', async () => {
    const client = createTestQueryClient();
    const firstVisit = render(<RepliesWarmupQueue />, client);
    await screen.findByDisplayValue('Sharp take.');
    await screen.findByText(/usage/);
    firstVisit.unmount();

    service.findAwaitingApproval.mockReturnValue(new Promise(() => {}));
    service.getReplyQueueUsage.mockReturnValue(new Promise(() => {}));
    render(<RepliesWarmupQueue />, client);

    expect(screen.getByDisplayValue('Sharp take.')).toBeInTheDocument();
    expect(screen.getByText('@target')).toBeInTheDocument();
    expect(screen.getByText(/usage/)).toBeInTheDocument();
    expect(screen.queryByText('empty')).not.toBeInTheDocument();
  });
});
